"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdminInAction } from "./helpers";
import axios from "axios";

/*
 * DeepSeek CONNECTION TEST (Admin -> API Settings).
 *
 * Performs a tiny live request to verify the server-side key + model work.
 * Returns only safe, high-level information — never the API key or raw
 * upstream errors (build prompts #25, #26, #46).
 */

interface ConnectionTestResult {
  ok: boolean;
  status: "not-configured" | "connected" | "error";
  model?: string;
  latencyMs?: number;
  totalTokens?: number;
  message: string;
}

export const testConnection = action({
  args: { model: v.optional(v.string()) },
  handler: async (ctx, { model }): Promise<ConnectionTestResult> => {
    await requireAdminInAction(ctx);

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return {
        ok: false as const,
        status: "not-configured" as const,
        message:
          "No API key configured. Add DEEPSEEK_API_KEY in the project's Keys settings.",
      };
    }

    // Resolve which model to test: the requested one, or the configured one.
    let modelToTest: string | undefined = model;
    if (!modelToTest) {
      const settings = await ctx.runQuery(internal.aiInternals.getSettings, {});
      modelToTest = settings.model;
    }

    const startedAt = Date.now();
    try {
      const response = await axios.post(
        "https://api.deepseek.com/chat/completions",
        {
          model: modelToTest,
          messages: [{ role: "user", content: "Reply with the single word: ok" }],
          max_tokens: 5,
          temperature: 0,
          stream: false,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 20_000,
        },
      );
      const usage = response.data?.usage ?? {};
      const totalTokens = usage.total_tokens ?? 0;
      void usage;
      return {
        ok: true as const,
        status: "connected" as const,
        model: modelToTest,
        latencyMs: Date.now() - startedAt,
        totalTokens,
        message: "Connected successfully.",
      };
    } catch (error) {
      let message = "Could not reach the AI provider.";
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          message = "Authentication failed — check the configured API key.";
        } else if (error.response?.status === 402) {
          message = "Payment required on the AI provider account.";
        } else if (error.response?.status === 404 || error.response?.status === 400) {
          // Invalid model: do NOT activate it — the caller keeps the old model.
          message = `Model "${modelToTest}" is not available on this account.`;
        } else if (error.code === "ECONNABORTED") {
          message = "Connection test timed out.";
        }
        console.error(
          "[ai-test] Connection test failed:",
          error.response?.status,
          error.message,
        );
      }
      return {
        ok: false as const,
        status: "error" as const,
        model: modelToTest,
        message,
      };
    }
  },
});
