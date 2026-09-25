import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { DEFAULTS, SETTING_KEYS } from "./config";

/*
 * Internal (server-only) read helpers used by the AI pipeline in ai.ts.
 * Internal functions are never callable from the browser.
 */

/** Resolve the signed-in users-table id inside an ACTION context. */
export const getCurrentUserId = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await getAuthUserId(ctx);
  },
});

/** Fetch a user document by id (for role checks inside actions). */
export const getUserById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId);
  },
});

export const getProblemInternal = internalQuery({
  args: { problemId: v.id("problems") },
  handler: async (ctx, { problemId }) => {
    return await ctx.db.get(problemId);
  },
});

export const getActivePrompt = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("aiPrompts")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .first();
  },
});

export const getPromptInternal = internalQuery({
  args: { promptId: v.id("aiPrompts") },
  handler: async (ctx, { promptId }) => {
    return await ctx.db.get(promptId);
  },
});

/** Model + output settings for AI calls (api_settings row, env fallback). */
export const getSettings = internalQuery({
  args: {},
  handler: async (ctx) => {
    const getNum = async (key: string, fallback: number) => {
      const row = await ctx.db
        .query("systemSettings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      return typeof row?.value === "number" && row.value > 0 ? row.value : fallback;
    };
    const apiSettings = await ctx.db
      .query("apiSettings")
      .withIndex("by_provider", (q) => q.eq("provider", "deepseek"))
      .first();
    return {
      maxOutputTokens: await getNum(SETTING_KEYS.MAX_OUTPUT_TOKENS, DEFAULTS.MAX_OUTPUT_TOKENS),
      model: apiSettings?.model || process.env.DEEPSEEK_MODEL || "deepseek-chat",
    };
  },
});
