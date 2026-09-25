import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  DEFAULTS,
  RATE_LIMITS,
  SAFE_ERRORS,
  SETTING_KEYS,
} from "./config";
import { requireUser } from "./helpers";

/*
 * Problems: create + read.
 *
 * Security:
 *  - Creating requires authentication; text length is re-validated here
 *    (frontend validation is never sufficient — build prompt #39).
 *  - Reading is owner-only for normal users; admins use dedicated admin
 *    queries (build prompt #37).
 */

/** Create a problem row (status "pending"). Returns the new problem id. */
export const create = mutation({
  args: { problemText: v.string() },
  handler: async (ctx, { problemText }) => {
    const user = await requireUser(ctx);

    // ---- Server-side input validation (never trust the frontend) ----
    const maxLenSetting = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) =>
        q.eq("key", SETTING_KEYS.MAX_PROBLEM_LENGTH),
      )
      .first();
    const maxLen =
      typeof maxLenSetting?.value === "number"
        ? maxLenSetting.value
        : DEFAULTS.MAX_PROBLEM_LENGTH;

    const text = problemText.trim();
    if (text.length < DEFAULTS.MIN_PROBLEM_LENGTH) {
      throw new Error(
        `Please describe your problem in at least ${DEFAULTS.MIN_PROBLEM_LENGTH} characters.`,
      );
    }
    if (text.length > maxLen) {
      throw new Error(
        `Problem is too long. Maximum is ${maxLen} characters.`,
      );
    }

    // ---- Rate limiting (separate from the token budget) ----
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recent = await ctx.db
      .query("aiRequests")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const recentAi = recent.filter((r) => r.createdAt >= oneHourAgo);
    if (recentAi.length >= RATE_LIMITS.PROBLEMS_PER_HOUR) {
      throw new Error(SAFE_ERRORS.RATE_LIMIT);
    }
    const lastRequest = recentAi.reduce<number>(
      (latest, r) => Math.max(latest, r.createdAt),
      0,
    );
    if (Date.now() - lastRequest < RATE_LIMITS.PROBLEM_MIN_INTERVAL_MS) {
      throw new Error(
        "Please wait a few seconds between requests.",
      );
    }

    // Anonymous accounts can't use AI (they have no email and count against
    // the shared budget — keep them out of version 1).
    if (user.isAnonymous) {
      throw new Error("Anonymous sessions cannot submit AI problems. Please sign in with email.");
    }

    const now = Date.now();
    const problemId = await ctx.db.insert("problems", {
      userId: user._id,
      problemText: text,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    return { problemId };
  },
});

/** List the current user's problems (newest first, limit 50). */
export const listMine = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 50 }) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("problems")
      .withIndex("by_user_created", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(limit);
    return rows.map((p) => ({
      _id: p._id,
      problemText: p.problemText,
      status: p.status,
      createdAt: p.createdAt,
    }));
  },
});

/** Get one problem with its AI result. Owner or admin only. */
export const getWithResult = query({
  args: { problemId: v.id("problems") },
  handler: async (ctx, { problemId }) => {
    const user = await requireUser(ctx);
    const problem = await ctx.db.get(problemId);
    if (!problem) throw new Error(SAFE_ERRORS.NOT_FOUND);

    // ---- Authorization: users may only read their own problems ----
    const isOwner = problem.userId === user._id;
    const isAdmin = user.role === "admin";
    if (!isOwner && !isAdmin) throw new Error(SAFE_ERRORS.FORBIDDEN);

    // Result via ai_requests -> ai_responses.
    const request = await ctx.db
      .query("aiRequests")
      .withIndex("by_problem", (q) => q.eq("problemId", problemId))
      .first();
    let result: {
      summary: string;
      causes: string[];
      fixes: string[];
      model: string;
      totalTokens: number;
      inputTokens: number;
      outputTokens: number;
      promptId: string | null;
      status: string;
      errorMessage: string | null;
    } | null = null;

    if (request) {
      const response = await ctx.db
        .query("aiResponses")
        .withIndex("by_request", (q) => q.eq("requestId", request._id))
        .first();
      const prompt = request.promptId
        ? await ctx.db.get(request.promptId)
        : null;
      result = {
        summary: response?.summary ?? "",
        causes: response?.causes ?? [],
        fixes: response?.fixes ?? [],
        model: request.model,
        totalTokens: request.totalTokens,
        inputTokens: request.inputTokens,
        outputTokens: request.outputTokens,
        promptId: prompt ? `v${prompt.version}` : null,
        status: request.status,
        errorMessage: request.errorMessage ?? null,
      };
    }

    // Owner info for admins viewing reports.
    let owner: { name: string; email: string } | null = null;
    if (isAdmin && !isOwner) {
      const ownerUser = await ctx.db.get(problem.userId);
      owner = ownerUser
        ? { name: ownerUser.name ?? "", email: ownerUser.email ?? "" }
        : null;
    }

    return {
      _id: problem._id,
      problemText: problem.problemText,
      status: problem.status,
      createdAt: problem.createdAt,
      result,
      owner,
    };
  },
});
