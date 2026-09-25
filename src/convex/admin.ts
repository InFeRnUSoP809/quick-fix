import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./helpers";
import { DEEPSEEK_MODELS, SETTING_KEYS } from "./config";

/*
 * ADMIN FUNCTIONS.
 *
 * Every function here calls requireAdmin(ctx) FIRST, so a normal user gets
 * FORBIDDEN (surfaced as 403 in the UI) even if they call the API directly.
 * Authorization is always re-verified server-side (build prompt #41).
 */

/** List all users (no secrets — never passwords or tokens). */
export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    return users
      .map((u) => ({
        _id: u._id,
        name: u.name ?? null,
        email: u.email ?? null,
        role: u.role ?? "user",
        isAnonymous: u.isAnonymous ?? false,
        createdAt: u._creationTime,
      }))
      .sort((a, b) => a.createdAt - b.createdAt);
  },
});

/** Set a user's role (admin only). Cannot demote yourself. */
export const setUserRole = mutation({
  args: { userId: v.id("users"), role: v.union(v.literal("admin"), v.literal("user")) },
  handler: async (ctx, { userId, role }) => {
    const admin = await requireAdmin(ctx);
    if (admin._id === userId) {
      throw new Error("You cannot change your own role.");
    }
    await ctx.db.patch(userId, { role });
    return { ok: true };
  },
});

/** All problems with owner + AI result summary (Reports page). */
export const listAllProblems = query({
  args: {
    status: v.optional(v.union(v.literal("pending"), v.literal("processing"), v.literal("completed"), v.literal("failed"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, limit = 100 }) => {
    await requireAdmin(ctx);
    let rows;
    if (status) {
      rows = await ctx.db
        .query("problems")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(limit);
    } else {
      rows = await ctx.db.query("problems").withIndex("by_created").order("desc").take(limit);
    }
    const out = [];
    for (const p of rows) {
      const owner = await ctx.db.get(p.userId);
      const request = await ctx.db
        .query("aiRequests")
        .withIndex("by_problem", (q) => q.eq("problemId", p._id))
        .first();
      out.push({
        _id: p._id,
        problemText: p.problemText,
        status: p.status,
        createdAt: p.createdAt,
        owner: owner ? { name: owner.name ?? "", email: owner.email ?? "" } : null,
        hasResult: !!request && request.status === "success",
        totalTokens: request?.totalTokens ?? 0,
      });
    }
    return out;
  },
});

/** Prompt version history, newest first, with the active one flagged. */
export const listPrompts = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const prompts = await ctx.db.query("aiPrompts").collect();
    return prompts.sort((a, b) => b.version - a.version);
  },
});

/**
 * Save a NEW prompt version. Old versions are never overwritten (#23).
 * Activates the new version and deactivates all others so exactly one
 * prompt has is_active = true.
 */
export const savePromptVersion = mutation({
  args: { name: v.string(), promptText: v.string() },
  handler: async (ctx, { name, promptText }) => {
    const admin = await requireAdmin(ctx);

    if (!promptText.includes("{{problem}}")) {
      throw new Error("Prompt must include the {{problem}} variable.");
    }
    if (promptText.length > 8000) {
      throw new Error("Prompt is too long (max 8000 characters).");
    }
    if (name.trim().length === 0) throw new Error("Prompt name is required.");

    const prompts = await ctx.db.query("aiPrompts").collect();
    const nextVersion = prompts.reduce((max, p) => Math.max(max, p.version), 0) + 1;

    // Deactivate all existing versions, then insert the new active one —
    // both writes are in this single transaction, so there is never a moment
    // with zero or two active prompts.
    for (const p of prompts) {
      if (p.isActive) await ctx.db.patch(p._id, { isActive: false });
    }
    const id = await ctx.db.insert("aiPrompts", {
      name: name.trim(),
      promptText,
      version: nextVersion,
      isActive: true,
      createdBy: admin._id,
    });
    return { id, version: nextVersion };
  },
});

/** Activate an existing (historical) prompt version — e.g. a rollback. */
export const activatePrompt = mutation({
  args: { promptId: v.id("aiPrompts") },
  handler: async (ctx, { promptId }) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(promptId);
    if (!target) throw new Error("Prompt not found.");
    const prompts = await ctx.db.query("aiPrompts").collect();
    for (const p of prompts) {
      if (p.isActive && p._id !== promptId) await ctx.db.patch(p._id, { isActive: false });
    }
    await ctx.db.patch(promptId, { isActive: true });
    return { ok: true };
  },
});

/** API settings (provider/model/enabled). The API key is NEVER included. */
export const getApiSettings = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await ctx.db
      .query("apiSettings")
      .withIndex("by_provider", (q) => q.eq("provider", "deepseek"))
      .first();
    const hasKey = !!process.env.DEEPSEEK_API_KEY; // presence only — never the value
    return {
      provider: row?.provider ?? "deepseek",
      model: row?.model ?? "deepseek-chat",
      isEnabled: row?.isEnabled ?? true,
      hasApiKeyConfigured: hasKey,
      availableModels: DEEPSEEK_MODELS,
      updatedAt: row?._creationTime ?? null,
    };
  },
});

/** Update model / enable flag (model is validated against the known list). */
export const updateApiSettings = mutation({
  args: {
    model: v.string(),
    isEnabled: v.boolean(),
  },
  handler: async (ctx, { model, isEnabled }) => {
    await requireAdmin(ctx);
    const allowed = DEEPSEEK_MODELS.some((m) => m.id === model);
    if (!allowed) throw new Error("Unsupported model. Choose one from the list.");
    const row = await ctx.db
      .query("apiSettings")
      .withIndex("by_provider", (q) => q.eq("provider", "deepseek"))
      .first();
    if (row) {
      await ctx.db.patch(row._id, { model, isEnabled });
    } else {
      await ctx.db.insert("apiSettings", {
        provider: "deepseek",
        model,
        isEnabled,
      });
    }
    return { ok: true };
  },
});

/** Read the admin-editable system settings with current values. */
export const getSystemSettings = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("systemSettings").collect();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const num = (key: string, fallback: number) =>
      typeof map.get(key) === "number" ? (map.get(key) as number) : fallback;
    return {
      aiTokenBudget: num(SETTING_KEYS.AI_TOKEN_BUDGET, 20_000),
      maxOutputTokens: num(SETTING_KEYS.MAX_OUTPUT_TOKENS, 300),
      maxProblemLength: num(SETTING_KEYS.MAX_PROBLEM_LENGTH, 1000),
      rateLimits: { problemsPerHour: 10, minIntervalSeconds: 5 }, // server-side only
    };
  },
});

/**
 * Update a system setting. Critical protections can be tightened but never
 * disabled: budget/output/length must stay >= sane minimums (#27).
 */
export const updateSystemSetting = mutation({
  args: { key: v.string(), value: v.number() },
  handler: async (ctx, { key, value }) => {
    await requireAdmin(ctx);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("Value must be a positive number.");
    }
    const limits: Record<string, { min: number; max: number }> = {
      [SETTING_KEYS.AI_TOKEN_BUDGET]: { min: 1000, max: 5_000_000 },
      [SETTING_KEYS.MAX_OUTPUT_TOKENS]: { min: 100, max: 2000 },
      [SETTING_KEYS.MAX_PROBLEM_LENGTH]: { min: 50, max: 4000 },
    };
    const limit = limits[key];
    if (!limit) throw new Error("Unknown setting.");
    if (value < limit.min || value > limit.max) {
      throw new Error(`Value must be between ${limit.min} and ${limit.max}.`);
    }
    const row = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (row) {
      await ctx.db.patch(row._id, { value });
    } else {
      await ctx.db.insert("systemSettings", { key, value });
    }
    return { ok: true };
  },
});

/** Recent AI requests for the usage table (admin only). */
export const listRecentAiRequests = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 25 }) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("aiRequests")
      .withIndex("by_created")
      .order("desc")
      .take(limit);
    const out = [];
    for (const r of rows) {
      let kind: "test" | "problem" = r.isTest ? "test" : "problem";
      out.push({
        _id: r._id,
        createdAt: r.createdAt,
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        totalTokens: r.totalTokens,
        status: r.status,
        kind,
        responseTimeMs: r.responseTimeMs,
        errorMessage: r.errorMessage ?? null,
      });
    }
    return out;
  },
});

/** Admin overview counters + recent problems (#19). */
export const getOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    const problems = await ctx.db.query("problems").collect();
    const requests = await ctx.db.query("aiRequests").collect();
    const tokensUsedRow = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", "ai_tokens_used"))
      .first();
    const budgetRow = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", "ai_token_budget"))
      .first();
    const activePrompt = await ctx.db
      .query("aiPrompts")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .first();

    const recentProblems = await ctx.db
      .query("problems")
      .withIndex("by_created")
      .order("desc")
      .take(8);
    const recent = [];
    for (const p of recentProblems) {
      const owner = await ctx.db.get(p.userId);
      recent.push({
        _id: p._id,
        problemText: p.problemText,
        status: p.status,
        createdAt: p.createdAt,
        ownerEmail: owner?.email ?? "unknown",
      });
    }

    return {
      totalUsers: users.length,
      totalProblems: problems.length,
      aiRequests: requests.length,
      failedRequests: requests.filter((r) => r.status === "failed").length,
      tokensUsed: typeof tokensUsedRow?.value === "number" ? tokensUsedRow.value : 0,
      tokenBudget: typeof budgetRow?.value === "number" ? budgetRow.value : 20_000,
      activePromptVersion: activePrompt ? `v${activePrompt.version}` : "none",
      deepseekConfigured: !!process.env.DEEPSEEK_API_KEY,
      aiEnabled: true, // refined below in getApiSettings-based views
      recentProblems: recent,
    };
  },
});
