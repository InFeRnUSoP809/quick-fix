import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/*
 * Internal (server-only) persistence for the AI pipeline. Splitting the
 * writes into mutations keeps each Convex transaction small and lets the
 * node action compose them safely.
 */

export const recordSuccess = internalMutation({
  args: {
    userId: v.id("users"),
    problemId: v.optional(v.id("problems")),
    promptId: v.optional(v.id("aiPrompts")),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    totalTokens: v.number(),
    responseTimeMs: v.number(),
    isTest: v.boolean(),
    summary: v.string(),
    causes: v.array(v.string()),
    fixes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const requestId = await ctx.db.insert("aiRequests", {
      userId: args.userId,
      problemId: args.problemId,
      promptId: args.promptId,
      isTest: args.isTest,
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      totalTokens: args.totalTokens,
      status: "success",
      responseTimeMs: args.responseTimeMs,
      createdAt: now,
    });
    await ctx.db.insert("aiResponses", {
      requestId,
      summary: args.summary,
      causes: args.causes,
      fixes: args.fixes,
    });
    if (args.problemId) {
      await ctx.db.patch(args.problemId, {
        status: "completed",
        updatedAt: now,
      });
    }
    return { requestId };
  },
});

export const recordFailedRequest = internalMutation({
  args: {
    userId: v.id("users"),
    problemId: v.optional(v.id("problems")),
    promptId: v.optional(v.id("aiPrompts")),
    model: v.string(),
    isTest: v.boolean(),
    errorMessage: v.string(),
    responseTimeMs: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("aiRequests", {
      userId: args.userId,
      problemId: args.problemId,
      promptId: args.promptId,
      isTest: args.isTest,
      model: args.model,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      status: "failed",
      responseTimeMs: args.responseTimeMs,
      errorMessage: args.errorMessage,
      createdAt: Date.now(),
    });
  },
});

export const markProblemProcessing = internalMutation({
  args: { problemId: v.id("problems") },
  handler: async (ctx, { problemId }) => {
    await ctx.db.patch(problemId, { status: "processing", updatedAt: Date.now() });
  },
});

export const markProblemFailed = internalMutation({
  args: { problemId: v.id("problems"), errorMessage: v.string() },
  handler: async (ctx, { problemId, errorMessage }) => {
    await ctx.db.patch(problemId, {
      status: "failed",
      updatedAt: Date.now(),
    });
    // Keep the safe error message for display on the problem detail view.
    const request = await ctx.db
      .query("aiRequests")
      .withIndex("by_problem", (q) => q.eq("problemId", problemId))
      .first();
    if (!request) {
      // No request row yet (e.g. validation failed before AI ran): record one
      // so the failure is visible in history and reports.
      const problem = await ctx.db.get(problemId);
      if (problem) {
        await ctx.db.insert("aiRequests", {
          userId: problem.userId,
          problemId,
          promptId: undefined,
          isTest: false,
          model: "not-called",
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          status: "failed",
          responseTimeMs: 0,
          errorMessage,
          createdAt: Date.now(),
        });
      }
    }
  },
});
