import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    /*
     * QuickFix AI domain tables.
     *
     * Data flow (matches the architecture in the build prompt):
     *   problems -> ai_requests -> ai_responses
     *                          -> ai_prompts (versioned prompt used)
     */

    // A user-submitted problem. One row per "Get Quick Fix" click.
    problems: defineTable({
      userId: v.id("users"),
      problemText: v.string(),
      status: v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
      ),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"])
      .index("by_user_created", ["userId", "createdAt"])
      .index("by_created", ["createdAt"]),

    // One row per DeepSeek call (success or failure). Token usage is the
    // single source of truth for the hard AI budget.
    aiRequests: defineTable({
      userId: v.id("users"),
      problemId: v.optional(v.id("problems")), // null for admin prompt tests
      promptId: v.optional(v.id("aiPrompts")),
      isTest: v.optional(v.boolean()),
      model: v.string(),
      inputTokens: v.number(),
      outputTokens: v.number(),
      totalTokens: v.number(),
      status: v.union(v.literal("success"), v.literal("failed")),
      responseTimeMs: v.number(),
      errorMessage: v.optional(v.string()), // safe, human-readable only
      createdAt: v.number(),
    })
      .index("by_problem", ["problemId"])
      .index("by_prompt", ["promptId"])
      .index("by_user", ["userId"])
      .index("by_created", ["createdAt"]),

    // Structured AI output for a successful request.
    aiResponses: defineTable({
      requestId: v.id("aiRequests"),
      summary: v.string(),
      causes: v.array(v.string()),
      fixes: v.array(v.string()),
    }).index("by_request", ["requestId"]),

    // Versioned system prompts. Old versions are never overwritten; exactly
    // one row should normally have isActive = true.
    aiPrompts: defineTable({
      name: v.string(),
      promptText: v.string(),
      version: v.number(),
      isActive: v.boolean(),
      createdBy: v.optional(v.id("users")),
    }).index("by_active", ["isActive"]),

    // Non-sensitive AI provider configuration. The DeepSeek API key itself
    // lives ONLY in the server-side environment (DEEPSEEK_API_KEY).
    apiSettings: defineTable({
      provider: v.string(),
      model: v.string(),
      isEnabled: v.boolean(),
    }).index("by_provider", ["provider"]),

    // Simple key/value system settings (budget, limits...).
    // Special reserved keys: "ai_token_budget" (hard cap) and
    // "ai_tokens_used" (tokens actually consumed, managed by aiBudget.ts).
    systemSettings: defineTable({
      key: v.string(),
      value: v.any(),
    }).index("by_key", ["key"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
