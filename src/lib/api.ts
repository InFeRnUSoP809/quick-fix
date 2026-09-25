import { supabase } from "@/lib/supabaseClient";

/*
 * Data layer — Supabase.
 *
 * All reads/writes go through RLS-protected tables: a signed-in user can only
 * ever see their own problems/results (owner policies), and admin queries
 * depend on the profiles.role = 'admin' check inside is_admin().
 */

export type ProblemStatus = "pending" | "processing" | "completed" | "failed";

export interface MyProblemRow {
  id: string;
  problem_text: string;
  status: ProblemStatus;
  created_at: string;
}

export interface ProblemResultRow {
  summary: string;
  causes: string[];
  fixes: string[];
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  prompt_version: number | null;
  error_message: string | null;
}

/* ------------------------------------------------------------------ */
/* My problems                                                         */
/* ------------------------------------------------------------------ */

export async function listMyProblems(limit = 50): Promise<MyProblemRow[]> {
  const { data, error } = await supabase
    .from("problems")
    .select("id, problem_text, status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as MyProblemRow[];
}

export interface ProblemWithResult {
  id: string;
  problem_text: string;
  status: ProblemStatus;
  created_at: string;
  result: ProblemResultRow | null;
}

export async function getProblemWithResult(
  problemId: string,
): Promise<ProblemWithResult | null> {
  // 1) The problem row (RLS: owner or admin).
  const { data: problem, error } = await supabase
    .from("problems")
    .select("id, problem_text, status, created_at")
    .eq("id", problemId)
    .maybeSingle();
  if (error) throw error;
  if (!problem) return null;

  // 2) Its request + response (RLS: owner or admin via ai_requests).
  const { data: req } = await supabase
    .from("ai_requests")
    .select(
      "id, model, input_tokens, output_tokens, total_tokens, status, error_message, prompt_id",
    )
    .eq("problem_id", problemId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let result: ProblemResultRow | null = null;
  if (req) {
    const { data: resp } = await supabase
      .from("ai_responses")
      .select("summary, causes, fixes")
      .eq("request_id", req.id)
      .maybeSingle();
    let promptVersion: number | null = null;
    if (req.prompt_id) {
      const { data: prompt } = await supabase
        .from("ai_prompts")
        .select("version")
        .eq("id", req.prompt_id)
        .maybeSingle();
      promptVersion = prompt?.version ?? null;
    }
    result = {
      summary: resp?.summary ?? "",
      causes: resp?.causes ?? [],
      fixes: resp?.fixes ?? [],
      model: req.model,
      input_tokens: req.input_tokens,
      output_tokens: req.output_tokens,
      total_tokens: req.total_tokens,
      prompt_version: promptVersion,
      error_message: req.error_message,
    };
  }

  return {
    id: problem.id,
    problem_text: problem.problem_text,
    status: problem.status,
    created_at: problem.created_at,
    result,
  };
}

/* ------------------------------------------------------------------ */
/* Problem creation + AI run                                           */
/* ------------------------------------------------------------------ */

export async function createProblem(text: string): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("problems")
    .insert({
      user_id: userId,
      problem_text: text,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * Invokes the Supabase Edge Function that runs the AI pipeline:
 * validates the input, enforces the token budget, calls DeepSeek with the
 * server-held key, and persists request + response rows.
 */
export async function runAiPipeline(
  problemId: string,
  problemText: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke("quickfix-ai", {
    body: { mode: "problem", problemId, problemText },
  });
  if (error) {
    // EdgeFunction errors surface as EdgeFunctionError; the message is safe
    // (our function returns human-readable messages only).
    return { ok: false, error: error.message };
  }
  return (data as { ok: boolean; error?: string }) ?? { ok: false, error: "No response." };
}

/** Admin: tiny live ping to DeepSeek to verify key + model. */
export async function adminTestConnection(): Promise<{
  ok: boolean;
  status: string;
  message: string;
  latencyMs?: number;
}> {
  const { data, error } = await supabase.functions.invoke("quickfix-ai", {
    body: { mode: "test-connection" },
  });
  if (error) return { ok: false, status: "error", message: error.message };
  return (data as { ok: boolean; status: string; message: string; latencyMs?: number }) ?? {
    ok: false,
    status: "error",
    message: "No response.",
  };
}

/** Admin: run a prompt test through the real pipeline (counts tokens). */
export async function adminTestPrompt(
  problem: string,
  draftPromptText?: string,
): Promise<
  | { ok: true; result: { summary: string; causes: string[]; fixes: string[] }; tokens: number }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase.functions.invoke("quickfix-ai", {
    body: { mode: "test-prompt", problemText: problem, draftPromptText },
  });
  if (error) return { ok: false, error: error.message };
  return data as { ok: true; result: { summary: string; causes: string[]; fixes: string[] }; tokens: number } | { ok: false; error: string };
}

/* ------------------------------------------------------------------ */
/* Admin queries (RLS: is_admin() must pass)                           */
/* ------------------------------------------------------------------ */

export interface AdminUserRow {
  id: string;
  email: string | null;
  name: string | null;
  role: "user" | "admin";
  created_at: string;
}

export async function adminListUsers(): Promise<AdminUserRow[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, name, role, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AdminUserRow[];
}

export interface AdminProblemRow extends MyProblemRow {
  owner_email: string | null;
  total_tokens: number;
}

export async function adminListAllProblems(): Promise<AdminProblemRow[]> {
  const { data, error } = await supabase
    .from("problems")
    .select(
      "id, problem_text, status, created_at, profiles(email), ai_requests(total_tokens)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  type RawRow = {
    id: string;
    problem_text: string;
    status: ProblemStatus;
    created_at: string;
    profiles: { email: string } | { email: string }[] | null;
    ai_requests: { total_tokens: number }[] | null;
  };
  return ((data ?? []) as unknown as RawRow[]).map((row) => ({
    id: row.id,
    problem_text: row.problem_text,
    status: row.status,
    created_at: row.created_at,
    owner_email:
      Array.isArray(row.profiles)
        ? (row.profiles[0]?.email ?? null)
        : (row.profiles?.email ?? null),
    total_tokens: row.ai_requests?.[0]?.total_tokens ?? 0,
  }));
}

export interface UsageRow {
  id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  status: "success" | "failed";
  is_test: boolean;
  response_time_ms: number;
  error_message: string | null;
  created_at: string;
}

export async function adminListRecentRequests(
  limit = 25,
): Promise<UsageRow[]> {
  const { data, error } = await supabase
    .from("ai_requests")
    .select(
      "id, model, input_tokens, output_tokens, total_tokens, status, is_test, response_time_ms, error_message, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as UsageRow[];
}

export async function getBudgetStatus(): Promise<{
  budget: number;
  used: number;
  remaining: number;
  percent: number;
}> {
  const { data: rows, error } = await supabase
    .from("system_settings")
    .select("key, value");
  if (error) throw error;
  const map = new Map((rows ?? []).map((r) => [r.key, r.value]));
  const budget = Number(map.get("ai_token_budget") ?? 20000);
  const used = Number(map.get("ai_tokens_used") ?? 0);
  return {
    budget,
    used,
    remaining: Math.max(0, budget - used),
    percent: budget > 0 ? Math.min(100, (used / budget) * 100) : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Prompts + settings (reads; writes come in the admin UI update step)  */
/* ------------------------------------------------------------------ */

export interface PromptRow {
  id: string;
  name: string;
  prompt_text: string;
  version: number;
  is_active: boolean;
}

export async function listPrompts(): Promise<PromptRow[]> {
  const { data, error } = await supabase
    .from("ai_prompts")
    .select("id, name, prompt_text, version, is_active")
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PromptRow[];
}

export async function getSystemSettings(): Promise<{
  budget: number;
  maxOutputTokens: number;
  maxProblemLength: number;
}> {
  const { data: rows, error } = await supabase
    .from("system_settings")
    .select("key, value");
  if (error) throw error;
  const map = new Map((rows ?? []).map((r) => [r.key, r.value]));
  return {
    budget: Number(map.get("ai_token_budget") ?? 20000),
    maxOutputTokens: Number(map.get("max_output_tokens") ?? 300),
    maxProblemLength: Number(map.get("max_problem_length") ?? 1000),
  };
}

/* ------------------------------------------------------------------ */
/* Admin writes (RPCs re-verify the admin role server-side)            */
/* ------------------------------------------------------------------ */

export async function adminSetUserRole(userId: string, role: "user" | "admin") {
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) throw error;
}

export async function adminSavePromptVersion(name: string, promptText: string) {
  const { data, error } = await supabase.rpc("save_prompt_version", {
    p_name: name,
    p_prompt_text: promptText,
  });
  if (error) throw error;
  return data as number;
}

export async function adminActivatePrompt(promptId: string) {
  const { error } = await supabase.rpc("activate_prompt", { p_id: promptId });
  if (error) throw error;
}

export async function adminUpdateApiSettings(model: string, isEnabled: boolean) {
  const { error } = await supabase.rpc("admin_update_api_settings", {
    p_model: model,
    p_enabled: isEnabled,
  });
  if (error) throw error;
}

export async function adminUpdateSetting(key: string, value: number) {
  const { error } = await supabase.rpc("admin_update_setting", {
    p_key: key,
    p_value: value,
  });
  if (error) throw error;
}

export async function adminResetTokensUsed(used: number) {
  const { error } = await supabase.rpc("admin_set_tokens_used", { p_used: used });
  if (error) throw error;
}

export async function getApiSettingsInfo(): Promise<{
  model: string;
  isEnabled: boolean;
  hasApiKeyConfigured: boolean;
  availableModels: Array<{ id: string; label: string }>;
}> {
  const { data, error } = await supabase
    .from("api_settings")
    .select("model, is_enabled")
    .eq("provider", "deepseek")
    .maybeSingle();
  if (error) throw error;
  return {
    model: data?.model ?? "deepseek-chat",
    isEnabled: data?.is_enabled ?? true,
    // Presence only. The value itself never leaves the server.
    hasApiKeyConfigured: false,
    availableModels: [
      { id: "deepseek-chat", label: "deepseek-chat (recommended, cheapest)" },
      { id: "deepseek-reasoner", label: "deepseek-reasoner (slower, pricier)" },
    ],
  };
}
