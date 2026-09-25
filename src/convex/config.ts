import { internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

/*
 * Central configuration for QuickFix AI.
 *
 * Every AI limit lives here (or is overridden by a row in the
 * `system_settings` table via the admin dashboard). No request handler
 * hardcodes the budget, the model, or the prompt.
 */

/** System settings keys stored in the `systemSettings` table. */
export const SETTING_KEYS = {
  AI_TOKEN_BUDGET: "ai_token_budget", // hard total-token budget (default 20,000)
  MAX_OUTPUT_TOKENS: "max_output_tokens", // per-request output cap (default 300)
  MAX_PROBLEM_LENGTH: "max_problem_length", // chars (default 1000)
} as const;

export const DEFAULTS = {
  AI_TOKEN_BUDGET: 20_000,
  MAX_OUTPUT_TOKENS: 300,
  MAX_PROBLEM_LENGTH: 1000,
  MIN_PROBLEM_LENGTH: 10,
} as const;

/** Per-user AI rate limits (independent of the token budget). */
export const RATE_LIMITS = {
  PROBLEMS_PER_HOUR: 10,
  PROBLEM_MIN_INTERVAL_MS: 5_000, // duplicate-request guard
  TESTS_PER_HOUR: 20,
} as const;

/** DeepSeek models offered in the admin dropdown. DeepSeek's OpenAI-compatible
 * API bills these under one price; `deepseek-chat` is the cheap general
 * chat model and a safe default for this short structured-output task. */
export const DEEPSEEK_MODELS = [
  { id: "deepseek-chat", label: "deepseek-chat (recommended, cheapest)" },
  { id: "deepseek-reasoner", label: "deepseek-reasoner (slower, pricier)" },
] as const;

export const DEFAULT_MODEL = "deepseek-chat";

/**
 * Initial system prompt (v1). Kept short to minimize token usage.
 * `{{problem}}` is the only supported variable.
 */
export const DEFAULT_PROMPT = `You are QuickFix AI.

Analyze the user's problem and provide practical general suggestions.

Return valid JSON only:

{
  "summary": "short summary",
  "causes": ["cause 1", "cause 2", "cause 3"],
  "fixes": ["fix 1", "fix 2", "fix 3", "fix 4", "fix 5"]
}

Rules:
- Exactly 3 causes.
- Exactly 5 fixes.
- Keep each cause and fix under 12 words.
- Keep the summary under 30 words.
- Do not invent facts.
- Avoid dangerous instructions.
- Recommend an appropriate professional when necessary (doctor, lawyer, electrician, emergency services) instead of giving unsafe instructions.`;

/** Safe user-facing error messages (never leak internals). */
export const SAFE_ERRORS = {
  AI_UNAVAILABLE: "AI service temporarily unavailable.",
  AI_LIMIT: "AI usage limit reached. The daily token budget is exhausted.",
  AI_INVALID_RESPONSE: "AI returned an unexpected response. Please try again.",
  AI_DISABLED: "AI is currently disabled by an administrator.",
  RATE_LIMIT: "Too many requests. Please wait a moment and try again.",
  NOT_FOUND: "Not found.",
  FORBIDDEN: "You do not have permission to perform this action.",
} as const;

/**
 * Build the user message for DeepSeek. The prompt text is inserted with
 * `{{problem}}` substituted; the user message contains only the problem.
 */
export function buildUserPrompt(promptText: string, problem: string): string {
  return promptText.replace(/\{\{\s*problem\s*\}\}/g, problem);
}

/** Check that a prompt text contains the required {{problem}} variable. */
export function isValidPromptText(promptText: string): boolean {
  return /\{\{\s*problem\s*\}\}/.test(promptText);
}

/**
 * Lightweight settings loader. Reads a numeric setting from
 * system_settings, falling back to the default.
 */
export const getSettingNumber = internalQuery({
  args: {
    key: v.string(),
    fallback: v.number(),
  },
  handler: async (ctx, { key, fallback }) => {
    const row = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    const value = row?.value;
    return typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : fallback;
  },
});

/** Public health info (no secrets). */
export const getPublicConfig = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("apiSettings")
      .withIndex("by_provider", (q) => q.eq("provider", "deepseek"))
      .first();
    return {
      status: "ok" as const,
      app: "QuickFix AI",
      provider: "deepseek",
      aiEnabled: row?.isEnabled ?? false,
    };
  },
});
