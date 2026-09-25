import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./helpers";
import { api } from "./_generated/api";
import {
  DEFAULT_MODEL,
  DEFAULT_PROMPT,
  DEFAULTS,
  SETTING_KEYS,
} from "./config";

/**
 * One-time bootstrap. Seeds:
 *  - ai_prompts v1 (active) with the built-in default prompt
 *  - api_settings row for DeepSeek (model configurable, key stays in env)
 *  - system_settings rows (budget / limits)
 *  - promotes the given email to admin (first admin bootstrap)
 *
 * Safe to call multiple times: existing rows are left alone.
 */
export const bootstrap = mutation({
  args: { adminEmail: v.optional(v.string()) },
  handler: async (ctx, { adminEmail }) => {
    const changes: string[] = [];

    // 1. Default prompt (v1) if none exists yet.
    const anyPrompt = await ctx.db.query("aiPrompts").first();
    if (!anyPrompt) {
      await ctx.db.insert("aiPrompts", {
        name: "Default QuickFix prompt",
        promptText: DEFAULT_PROMPT,
        version: 1,
        isActive: true,
      });
      changes.push("seeded prompt v1");
    }

    // 2. DeepSeek settings row if missing.
    const settings = await ctx.db
      .query("apiSettings")
      .withIndex("by_provider", (q) => q.eq("provider", "deepseek"))
      .first();
    if (!settings) {
      await ctx.db.insert("apiSettings", {
        provider: "deepseek",
        model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
        isEnabled: true,
      });
      changes.push("seeded api_settings");
    }

    // 3. System settings if missing.
    const settingDefs: Array<[string, number]> = [
      [SETTING_KEYS.AI_TOKEN_BUDGET, DEFAULTS.AI_TOKEN_BUDGET],
      [SETTING_KEYS.MAX_OUTPUT_TOKENS, DEFAULTS.MAX_OUTPUT_TOKENS],
      [SETTING_KEYS.MAX_PROBLEM_LENGTH, DEFAULTS.MAX_PROBLEM_LENGTH],
    ];
    for (const [key, value] of settingDefs) {
      const existing = await ctx.db
        .query("systemSettings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      if (!existing) {
        await ctx.db.insert("systemSettings", { key, value });
        changes.push(`seeded setting ${key}`);
      }
    }

    // 4. Bootstrap admin: promote the user with this email (if they exist).
    if (adminEmail) {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", adminEmail))
        .first();
      if (user && user.role !== "admin") {
        await ctx.db.patch(user._id, { role: "admin" });
        changes.push(`promoted ${adminEmail} to admin`);
      }
    }

    return { ok: true, changes };
  },
});

/**
 * Dev convenience: promote the calling user to admin if they are the first
 * user in the system (idempotent). Used by the Admin bootstrap UI.
 */
export const becomeFirstAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await getCurrentUser(ctx);
    if (!me) throw new Error("Not authenticated");
    const users = await ctx.db.query("users").collect();
    const anyAdmin = users.some((u) => u.role === "admin");
    if (anyAdmin && me.role !== "admin") {
      return { ok: false, reason: "An admin already exists." };
    }
    if (me.role !== "admin") {
      await ctx.db.patch(me._id, { role: "admin" });
    }
    return { ok: true };
  },
});
