import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, requireAdmin } from "./helpers";

/*
 * HARD AI TOKEN BUDGET (default 20,000 total tokens).
 *
 * Enforced with a two-phase reservation so concurrent requests can never
 * overshoot the budget (Convex mutations are serializable transactions):
 *
 *   1. reserveTokens()  — BEFORE the DeepSeek call. Atomically checks
 *      `used + reservation <= budget` and increments the reservation. If the
 *      budget is exhausted the call is rejected: DeepSeek is never contacted.
 *   2. settleTokens()   — AFTER the response. Replaces the reservation with
 *      the ACTUAL usage reported by DeepSeek (input + output tokens).
 *   3. refundTokens()   — if DeepSeek failed or was never called, releases
 *      the reservation so the budget isn't stuck.
 *
 * The database — not the frontend counter — is the source of truth.
 */

/** Reserve up to `amount` tokens. Throws (caught by caller) if the budget
 * cannot cover it. Returns the reservation id to settle or refund. */
export const reserveTokens = internalMutation({
  args: {
    amount: v.number(),
  },
  handler: async (ctx, { amount }) => {
    const budget = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", "ai_token_budget"))
      .first();
    const budgetValue =
      typeof budget?.value === "number" ? budget.value : 20_000;

    const row = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", "ai_tokens_used"))
      .first();
    const used = typeof row?.value === "number" ? row.value : 0;

    if (used + amount > budgetValue) {
      throw new Error("AI usage limit reached.");
    }

    if (row) {
      await ctx.db.patch(row._id, { value: used + amount });
    } else {
      await ctx.db.insert("systemSettings", { key: "ai_tokens_used", value: amount });
    }
    return { reserved: amount, usedAfter: used + amount, budget: budgetValue };
  },
});

/** Replace the reservation with actual token usage reported by DeepSeek. */
export const settleTokens = internalMutation({
  args: {
    reserved: v.number(),
    actualTotal: v.number(),
  },
  handler: async (ctx, { reserved, actualTotal }) => {
    const row = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", "ai_tokens_used"))
      .first();
    const used = typeof row?.value === "number" ? row.value : 0;
    const next = Math.max(0, used - reserved + actualTotal);
    if (row) {
      await ctx.db.patch(row._id, { value: next });
    } else {
      await ctx.db.insert("systemSettings", { key: "ai_tokens_used", value: next });
    }
    return { usedAfter: next };
  },
});

/** Release a reservation (DeepSeek call failed or was never made). */
export const refundTokens = internalMutation({
  args: { amount: v.number() },
  handler: async (ctx, { amount }) => {
    const row = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", "ai_tokens_used"))
      .first();
    const used = typeof row?.value === "number" ? row.value : 0;
    const next = Math.max(0, used - amount);
    if (row) {
      await ctx.db.patch(row._id, { value: next });
    }
    return { usedAfter: next };
  },
});

/** Reset the counter to a specific value (admin only, e.g. new budget cycle). */
export const adminSetTokensUsed = mutation({
  args: { used: v.number() },
  handler: async (ctx, { used }) => {
    await requireAdmin(ctx); // server-side role check — never trust the client
    const row = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", "ai_tokens_used"))
      .first();
    if (row) {
      await ctx.db.patch(row._id, { value: Math.max(0, used) });
    } else {
      await ctx.db.insert("systemSettings", { key: "ai_tokens_used", value: Math.max(0, used) });
    }
    return { ok: true };
  },
});

/** Live budget snapshot for dashboards. Reads the used counter, computes
 * breakdown from the actual ai_requests log (input vs output). */
export const getBudgetStatus = query({
  args: {},
  handler: async (ctx) => {
    const me = await getCurrentUser(ctx);
    const isAdmin = me?.role === "admin";

    const budgetRow = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", "ai_token_budget"))
      .first();
    const budget = typeof budgetRow?.value === "number" ? budgetRow.value : 20_000;

    const usedRow = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", "ai_tokens_used"))
      .first();
    const used = typeof usedRow?.value === "number" ? usedRow.value : 0;

    // Breakdown from the request log (may lag the reservation slightly).
    let inputTokens = 0;
    let outputTokens = 0;
    let requestCount = 0;
    const requests = await ctx.db.query("aiRequests").collect();
    for (const r of requests) {
      inputTokens += r.inputTokens;
      outputTokens += r.outputTokens;
      requestCount += 1;
    }

    return {
      budget,
      used,
      remaining: Math.max(0, budget - used),
      percent: budget > 0 ? Math.min(100, (used / budget) * 100) : 0,
      inputTokens,
      outputTokens,
      requestCount,
      isAdmin, // only admins may see the full ledger
    };
  },
});
