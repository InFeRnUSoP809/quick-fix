"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { GenericActionCtx } from "convex/server";
import type { DataModel, Id } from "./_generated/dataModel";
import { DEFAULTS, SAFE_ERRORS, isValidPromptText } from "./config";
import { requireAdminInAction, requireUserInAction } from "./helpers";
import axios from "axios";

/*
 * AI PIPELINE (DeepSeek).
 *
 * The browser NEVER talks to DeepSeek directly and NEVER sees the API key:
 *
 *   PWA  ->  Convex action (this file)  ->  DeepSeek  ->  back to PWA
 *
 * Flow for every AI request (mirrors build prompt #14):
 *   validate input -> check auth -> check rate limit -> check/RESERVE budget
 *   -> load active prompt -> call DeepSeek -> validate JSON -> settle actual
 *   token usage (or refund on failure) -> persist request/response
 *
 * The API key comes from the server-side environment variable
 * DEEPSEEK_API_KEY (set in the Freebuff keys UI) and is never returned to any
 * client. The model is centralized in the api_settings row / DEEPSEEK_MODEL.
 */

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

interface DeepSeekUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface QuickFixResult {
  summary: string;
  causes: string[];
  fixes: string[];
}

/** Shape returned by every AI pipeline entry point. */
export type AiOutcome =
  | { ok: true; requestId: Id<"aiRequests">; result: QuickFixResult; tokens: number }
  | { ok: false; error: string };

type AiActionCtx = GenericActionCtx<DataModel>;

/** Validate the structured AI response (build prompt #12). Throws on bad shape. */
function parseAiJson(raw: string): QuickFixResult {
  // DeepSeek is asked for JSON only; be tolerant of accidental code fences.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  const parsed = JSON.parse(cleaned) as Partial<QuickFixResult>;
  if (typeof parsed.summary !== "string" || parsed.summary.trim().length === 0) {
    throw new Error("missing summary");
  }
  if (!Array.isArray(parsed.causes) || parsed.causes.length === 0) {
    throw new Error("missing causes");
  }
  if (!Array.isArray(parsed.fixes) || parsed.fixes.length === 0) {
    throw new Error("missing fixes");
  }
  const strings = (arr: unknown[]) =>
    arr.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return {
    summary: parsed.summary.trim(),
    causes: strings(parsed.causes).slice(0, 3),
    fixes: strings(parsed.fixes).slice(0, 3),
  };
}

/** Estimated input tokens for the reservation (≈4 chars/token + overhead). */
function estimateTokens(problemText: string, promptText: string): number {
  return Math.ceil((problemText.length + promptText.length) / 4) + 150;
}

/* ------------------------------------------------------------------ */
/* Internal action: one DeepSeek call, fully persisted.               */
/* ------------------------------------------------------------------ */

const callArgs = {
  userId: v.id("users"),
  problemText: v.string(),
  problemId: v.optional(v.id("problems")),
  promptId: v.optional(v.id("aiPrompts")),
  promptText: v.string(),
  isTest: v.boolean(),
} as const;

const aiInternal = internalAction({
  args: callArgs,
  handler: async (
    ctx,
    { userId, problemText, problemId, promptId, promptText, isTest },
  ): Promise<AiOutcome> => {
    const startedAt = Date.now();

    // ---- 1. Reserve budget BEFORE calling DeepSeek (concurrency-safe) ----
    const estimate = estimateTokens(problemText, promptText);
    let reserved = 0;
    try {
      const res = await ctx.runMutation(internal.aiBudget.reserveTokens, {
        amount: estimate,
      });
      reserved = res.reserved;
    } catch {
      // Budget exhausted: reject WITHOUT calling DeepSeek (build prompt #14).
      return await fail(
        ctx,
        { userId, problemId, promptId, model: "not-called", isTest, startedAt },
        SAFE_ERRORS.AI_LIMIT,
        { refund: 0 },
      );
    }

    // Resolve which model to use: api_settings row -> env -> safe default.
    const settings = await ctx.runQuery(internal.aiInternals.getSettings, {});
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return await fail(
        ctx,
        { userId, problemId, promptId, model: settings.model, isTest, startedAt },
        SAFE_ERRORS.AI_UNAVAILABLE,
        { refund: reserved, log: "DEEPSEEK_API_KEY is not set server-side" },
      );
    }

    try {
      // ---- 3. Call DeepSeek (OpenAI-compatible chat completions) ----
      const httpResponse = await axios.post(
        `${DEEPSEEK_BASE_URL}/chat/completions`,
        {
          model: settings.model,
          messages: [
            { role: "system", content: promptText },
            { role: "user", content: `Problem:\n${problemText}` },
          ],
          response_format: { type: "json_object" },
          max_tokens: settings.maxOutputTokens,
          temperature: 0.3,
          stream: false,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 45_000,
        },
      );

      const usage: DeepSeekUsage = httpResponse.data?.usage ?? {};
      const inputTokens = usage.prompt_tokens ?? 0;
      const outputTokens = usage.completion_tokens ?? 0;
      const totalTokens = usage.total_tokens ?? inputTokens + outputTokens;

      // ---- 4. Validate the structured JSON response ----
      const result = parseAiJson(
        String(httpResponse.data?.choices?.[0]?.message?.content ?? ""),
      );

      // ---- 5. Settle ACTUAL usage against the reservation ----
      await ctx.runMutation(internal.aiBudget.settleTokens, {
        reserved,
        actualTotal: totalTokens,
      });

      // ---- 6. Persist request + response, complete the problem ----
      const { requestId } = await ctx.runMutation(internal.aiPersist.recordSuccess, {
        userId,
        problemId: problemId ?? undefined,
        promptId: promptId ?? undefined,
        model: settings.model,
        inputTokens,
        outputTokens,
        totalTokens,
        responseTimeMs: Date.now() - startedAt,
        isTest,
        summary: result.summary,
        causes: result.causes,
        fixes: result.fixes,
      });

      return { ok: true as const, requestId, result, tokens: totalTokens };
    } catch (error) {
      // ---- Refund the reservation; log a SAFE error only ----
      // (Explicit string type: don't let TS widen SAFE_ERRORS to a literal.)
      let safeMessage: string = SAFE_ERRORS.AI_UNAVAILABLE;
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          safeMessage = "AI provider rejected the credentials.";
        } else if (error.code === "ECONNABORTED") {
          safeMessage = "AI request timed out.";
        }
        // Log details server-side; NEVER echo response bodies to clients
        // (they may contain upstream ids, quota info, etc.).
        console.error("[ai] DeepSeek call failed:", error.response?.status, error.message);
      } else if (error instanceof SyntaxError) {
        safeMessage = SAFE_ERRORS.AI_INVALID_RESPONSE;
        console.error("[ai] DeepSeek returned invalid JSON");
      } else {
        console.error("[ai] Unexpected error:", error instanceof Error ? error.message : error);
      }
      return await fail(
        ctx,
        { userId, problemId, promptId, model: settings.model, isTest, startedAt },
        safeMessage,
        { refund: reserved },
      );
    }
  },
});

export { aiInternal };

/** Shared failure path: refund, persist a failed request row, mark problem. */
async function fail(
  ctx: AiActionCtx,
  opts: {
    userId: string;
    problemId?: string;
    promptId?: string;
    model: string;
    isTest: boolean;
    startedAt: number;
  },
  safeMessage: string,
  extra: { refund: number; log?: string },
): Promise<{ ok: false; error: string }> {
  if (extra.refund > 0) {
    await ctx.runMutation(internal.aiBudget.refundTokens, { amount: extra.refund });
  }
  if (extra.log) console.error("[ai]", extra.log);
  await ctx.runMutation(internal.aiPersist.recordFailedRequest, {
    userId: opts.userId as never,
    problemId: opts.problemId as never,
    promptId: opts.promptId as never,
    model: opts.model,
    isTest: opts.isTest,
    errorMessage: safeMessage,
    responseTimeMs: Date.now() - opts.startedAt,
  });
  if (opts.problemId) {
    await ctx.runMutation(internal.aiPersist.markProblemFailed, {
      problemId: opts.problemId as never,
      errorMessage: safeMessage,
    });
  }
  return { ok: false as const, error: safeMessage };
}

/* ------------------------------------------------------------------ */
/* Public action: run a problem through the pipeline (authenticated).  */
/* ------------------------------------------------------------------ */

/**
 * Orchestration entry the frontend calls after creating a problem row.
 * Loads the ACTIVE prompt version and records it on the request, so every
 * response is traceable to the exact prompt that generated it (#23).
 */
export const runProblem = action({
  args: { problemId: v.id("problems") },
  handler: async (ctx, { problemId }): Promise<AiOutcome> => {
    const userId = await requireUserInAction(ctx);

    const problem = await ctx.runQuery(internal.aiInternals.getProblemInternal, {
      problemId,
    });
    if (!problem) throw new Error(SAFE_ERRORS.NOT_FOUND);
    if (problem.userId !== userId) throw new Error(SAFE_ERRORS.FORBIDDEN);
    if (problem.status === "completed") {
      throw new Error("This problem has already been processed.");
    }

    const activePrompt = await ctx.runQuery(internal.aiInternals.getActivePrompt, {});
    if (!activePrompt) {
      throw new Error("No active AI prompt configured. Ask an administrator.");
    }

    // Mark processing (best effort — status is also corrected on completion).
    await ctx.runMutation(internal.aiPersist.markProblemProcessing, { problemId });

    return await ctx.runAction(internal.ai.aiInternal, {
      userId,
      problemText: problem.problemText,
      problemId,
      promptId: activePrompt._id,
      promptText: activePrompt.promptText,
      isTest: false,
    });
  },
});

/* ------------------------------------------------------------------ */
/* Public action: admin prompt testing (counts against the budget).    */
/* ------------------------------------------------------------------ */

/**
 * Test a prompt WITHOUT saving it as a problem (build prompt #24). Optionally
 * accepts unsaved draft prompt text so admins can test before saving a
 * version. Tokens used count against the shared 20,000-token budget.
 */
export const testPrompt = action({
  args: {
    promptId: v.optional(v.id("aiPrompts")),
    draftPromptText: v.optional(v.string()),
    problem: v.string(),
  },
  handler: async (ctx, { promptId, draftPromptText, problem }): Promise<AiOutcome> => {
    const adminId = await requireAdminInAction(ctx);

    const text = problem.trim();
    if (text.length < DEFAULTS.MIN_PROBLEM_LENGTH) {
      throw new Error(`Test problem must be at least ${DEFAULTS.MIN_PROBLEM_LENGTH} characters.`);
    }
    if (text.length > 1000) throw new Error("Test problem is too long (max 1000 characters).");

    let promptIdToUse: Id<"aiPrompts"> | undefined;
    let promptTextToUse: string;

    if (draftPromptText && draftPromptText.trim().length > 0) {
      if (!isValidPromptText(draftPromptText)) {
        throw new Error("Prompt must include the {{problem}} variable.");
      }
      promptTextToUse = draftPromptText;
      promptIdToUse = promptId; // may be undefined for pure drafts
    } else if (promptId) {
      const prompt = await ctx.runQuery(internal.aiInternals.getPromptInternal, {
        promptId,
      });
      if (!prompt) throw new Error(SAFE_ERRORS.NOT_FOUND);
      promptTextToUse = prompt.promptText;
      promptIdToUse = prompt._id;
    } else {
      const activePrompt = await ctx.runQuery(internal.aiInternals.getActivePrompt, {});
      if (!activePrompt) throw new Error("No active AI prompt configured.");
      promptTextToUse = activePrompt.promptText;
      promptIdToUse = activePrompt._id;
    }

    return await ctx.runAction(internal.ai.aiInternal, {
      userId: adminId,
      problemText: text,
      problemId: undefined, // tests are NEVER saved as user problems
      promptId: promptIdToUse,
      promptText: promptTextToUse,
      isTest: true,
    });
  },
});
