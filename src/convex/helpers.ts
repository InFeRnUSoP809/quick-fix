import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericActionCtx } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { DataModel } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";

/*
 * Shared auth helpers.
 *
 * Security rule (build prompt #41): NEVER trust the frontend. Every backend
 * function re-derives the caller's identity and role server-side.
 *
 * Two flavors exist because queries/mutations have `ctx.db` while actions
 * (node runtime) do not. Actions resolve the user through internal queries;
 * `ctx.runQuery` from an action forwards the caller's auth context, so the
 * internal query sees the same signed-in identity.
 */

/** Get the current user document in a query/mutation, or null when signed out. */
export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  return await ctx.db.get(userId);
}

/** Require a signed-in user in a query/mutation; throws otherwise. */
export async function requireUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }
  return user;
}

/** Require a signed-in admin in a query/mutation. Users get FORBIDDEN. */
export async function requireAdmin(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return user;
}

/* ------------------------------------------------------------------ */
/* Action-context variants (no ctx.db in actions).                    */
/* ------------------------------------------------------------------ */

type ActionCtx = GenericActionCtx<DataModel>;

/** Require a signed-in user inside an action. Returns the users-table id. */
export async function requireUserInAction(ctx: ActionCtx): Promise<Id<"users">> {
  const userId = await ctx.runQuery(internal.aiInternals.getCurrentUserId, {});
  if (!userId) throw new Error("UNAUTHENTICATED");
  return userId;
}

/** Require a signed-in admin inside an action. Returns the users-table id. */
export async function requireAdminInAction(ctx: ActionCtx): Promise<Id<"users">> {
  const userId = await requireUserInAction(ctx);
  const user = await ctx.runQuery(internal.aiInternals.getUserById, { userId });
  if (!user) throw new Error("UNAUTHENTICATED");
  if (user.role !== "admin") throw new Error("FORBIDDEN");
  return userId;
}

/** True when `user` may read `problem`: owner or admin. */
export function canAccessProblem(
  user: Doc<"users">,
  problem: Doc<"problems">,
): boolean {
  return user.role === "admin" || problem.userId === user._id;
}

export type { Id };
