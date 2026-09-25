// Supabase Edge Function: quickfix-ai
//
// The secure server-side AI pipeline (the "FastAPI" of this architecture):
//   auth -> validate -> rate limit -> budget reserve -> load prompt ->
//   DeepSeek -> validate JSON -> settle budget -> persist request/response
//
// Deploy:
//   supabase functions deploy quickfix-ai
//   supabase secrets set DEEPSEEK_API_KEY=sk-...
//
// The DeepSeek key lives ONLY in this function's environment — the browser
// never sees it. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected
// by Supabase at runtime.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

const SAFE_ERRORS = {
  unauthenticated: "Please sign in to use QuickFix AI.",
  invalid: "Please describe your problem in at least 10 characters.",
  too_long: "Problem is too long (max 1000 characters).",
  rate_limit: "Too many requests. Please wait a moment and try again.",
  budget: "AI usage limit reached. The token budget is exhausted.",
  disabled: "AI is currently disabled by an administrator.",
  no_prompt: "No active AI prompt configured.",
  no_key: "AI is not configured. Ask an administrator to set DEEPSEEK_API_KEY.",
  invalid_response: "AI returned an unexpected response. Please try again.",
  deepseek: "AI service temporarily unavailable.",
  not_found: "Problem not found.",
  forbidden: "You do not have permission to perform this action.",
} as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface QuickFixResult {
  summary: string;
  causes: string[];
  fixes: string[];
}

/** Tolerant parse of the AI JSON (strips accidental code fences). */
function parseAiJson(raw: string): QuickFixResult {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  const parsed = JSON.parse(cleaned) as Partial<QuickFixResult>;
  if (typeof parsed.summary !== "string" || !parsed.summary.trim()) {
    throw new Error("missing summary");
  }
  if (!Array.isArray(parsed.causes) || parsed.causes.length === 0) {
    throw new Error("missing causes");
  }
  if (!Array.isArray(parsed.fixes) || parsed.fixes.length === 0) {
    throw new Error("missing fixes");
  }
  const strings = (arr: unknown[]) =>
    arr.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return {
    summary: parsed.summary.trim(),
    causes: strings(parsed.causes).slice(0, 3),
    fixes: strings(parsed.fixes).slice(0, 3),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const startedAt = Date.now();
  const authHeader = req.headers.get("Authorization") ?? "";

  let body: {
    mode?: "problem" | "test-connection" | "test-prompt";
    problemId?: string;
    problemText?: string;
    draftPromptText?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: SAFE_ERRORS.invalid }, 400);
  }
  const mode = body.mode ?? "problem";

  // Service client: bypasses RLS for persistence + settings.
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // ------------------------------------------------------------------
  // 1. Verify the caller's JWT and load their profile (role + tokens).
  // ------------------------------------------------------------------
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ ok: false, error: SAFE_ERRORS.unauthenticated }, 401);

  const { data: authData } = await supabaseAdmin.auth.getUser(token);
  const user = authData?.user;
  if (!user) return json({ ok: false, error: SAFE_ERRORS.unauthenticated }, 401);

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, is_anonymous")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return json({ ok: false, error: SAFE_ERRORS.unauthenticated }, 401);
  const { data: profileFull } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profileFull?.role as "user" | "admin") ?? "user";
  if (profile.is_anonymous) {
    return json({ ok: false, error: "Guest sessions cannot submit AI problems." }, 403);
  }

  // ------------------------------------------------------------------
  // 2a. Admin mode: test-connection (tiny live ping, no persistence).
  // ------------------------------------------------------------------
  if (mode === "test-connection") {
    if (role !== "admin") return json({ ok: false, error: SAFE_ERRORS.forbidden }, 403);
    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) {
      return json({
        ok: false,
        status: "not-configured",
        message: "No API key configured. Add DEEPSEEK_API_KEY as a Supabase secret.",
      });
    }
    const started = Date.now();
    try {
      const { data: modelRow } = await supabaseAdmin
        .from("api_settings")
        .select("model")
        .eq("provider", "deepseek")
        .maybeSingle();
      const res = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelRow?.model || "deepseek-chat",
          messages: [{ role: "user", content: "Reply with the single word: ok" }],
          max_tokens: 5,
          temperature: 0,
          stream: false,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const message =
          res.status === 401 || res.status === 403
            ? "Authentication failed — check the configured API key."
            : res.status === 402
              ? "Payment required on the AI provider account."
              : res.status === 404 || res.status === 400
                ? `Model is not available on this account.`
                : "Could not reach the AI provider.";
        return json({ ok: false, status: "error", message });
      }
      const payload = await res.json();
      return json({
        ok: true,
        status: "connected",
        model: modelRow?.model || "deepseek-chat",
        latencyMs: Date.now() - started,
        totalTokens: payload.usage?.total_tokens ?? 0,
        message: "Connected successfully.",
      });
    } catch (err) {
      return json({
        ok: false,
        status: "error",
        message: err instanceof DOMException && err.name === "AbortError"
          ? "Connection test timed out."
          : "Could not reach the AI provider.",
      });
    }
  }

  // ------------------------------------------------------------------
  // 2b. Admin mode: test-prompt (draft or saved prompt; counts tokens
  //     against the budget; never saved as a user problem).
  // ------------------------------------------------------------------
  if (mode === "test-prompt") {
    if (role !== "admin") return json({ ok: false, error: SAFE_ERRORS.forbidden }, 403);
    const testText = (body.problemText ?? "").trim();
    if (testText.length < 10) return json({ ok: false, error: SAFE_ERRORS.invalid }, 400);
    if (testText.length > 1000) return json({ ok: false, error: SAFE_ERRORS.too_long }, 400);

    let promptTextToUse: string;
    if (body.draftPromptText && body.draftPromptText.trim()) {
      if (!/\{\{\s*problem\s*\}\}/.test(body.draftPromptText)) {
        return json({ ok: false, error: "Prompt must include the {{problem}} variable." }, 400);
      }
      promptTextToUse = body.draftPromptText;
    } else {
      const { data: activePrompt } = await supabaseAdmin
        .from("ai_prompts")
        .select("prompt_text")
        .eq("is_active", true)
        .maybeSingle();
      if (!activePrompt) return json({ ok: false, error: SAFE_ERRORS.no_prompt }, 500);
      promptTextToUse = activePrompt.prompt_text;
    }

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) return json({ ok: false, error: SAFE_ERRORS.no_key }, 500);

    const estimate = Math.ceil((testText.length + promptTextToUse.length) / 4) + 150;
    const { data: reserved } = await supabaseAdmin.rpc("reserve_tokens", { p_amount: estimate });
    if (reserved !== true) return json({ ok: false, error: SAFE_ERRORS.budget }, 429);

    try {
      const res = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: promptTextToUse },
            { role: "user", content: `Problem:\n${testText}` },
          ],
          response_format: { type: "json_object" },
          max_tokens: 300,
          temperature: 0.3,
          stream: false,
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) return json({ ok: false, error: SAFE_ERRORS.deepseek }, 502);
      const payload = await res.json();
      const usage = payload.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      const result = parseAiJson(String(payload.choices?.[0]?.message?.content ?? ""));
      await supabaseAdmin.rpc("settle_tokens", {
        p_reserved: estimate,
        p_actual: usage.total_tokens ?? 0,
      });
      await supabaseAdmin.from("ai_requests").insert({
        user_id: user.id,
        problem_id: null,
        prompt_id: null,
        is_test: true,
        model: "deepseek-chat",
        input_tokens: usage.prompt_tokens ?? 0,
        output_tokens: usage.completion_tokens ?? 0,
        total_tokens: usage.total_tokens ?? 0,
        status: "success",
        response_time_ms: Date.now() - startedAt,
      });
      return json({ ok: true, result, tokens: usage.total_tokens ?? 0 });
    } catch {
      await supabaseAdmin.rpc("refund_tokens", { p_amount: estimate });
      return json({ ok: false, error: SAFE_ERRORS.invalid_response }, 502);
    }
  }

  // ------------------------------------------------------------------
  // 2c. Problem mode: validate input server-side (never trust the client).
  // ------------------------------------------------------------------
  const text = (body.problemText ?? "").trim();
  if (text.length < 10) return json({ ok: false, error: SAFE_ERRORS.invalid }, 400);
  if (text.length > 1000) return json({ ok: false, error: SAFE_ERRORS.too_long }, 400);

  // Optional problemId: when present, verify ownership.
  let problemId: string | null = null;
  if (body.problemId) {
    const { data: problem } = await supabaseAdmin
      .from("problems")
      .select("id, user_id, status")
      .eq("id", body.problemId)
      .maybeSingle();
    if (!problem || problem.user_id !== user.id) {
      return json({ ok: false, error: SAFE_ERRORS.not_found }, 404);
    }
    if (problem.status === "completed") {
      return json({ ok: false, error: "This problem has already been processed." }, 409);
    }
    problemId = problem.id;
  }

  // ------------------------------------------------------------------
  // 3. Rate limit: max 10 requests/hour, min 5s between requests.
  // ------------------------------------------------------------------
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("ai_requests")
    .select("created_at")
    .eq("user_id", user.id)
    .gte("created_at", oneHourAgo)
    .order("created_at", { ascending: false });
  const recentRows = recent ?? [];
  if (recentRows.length >= 10) {
    return json({ ok: false, error: SAFE_ERRORS.rate_limit }, 429);
  }
  if (recentRows[0]) {
    const sinceMs = Date.now() - new Date(recentRows[0].created_at).getTime();
    if (sinceMs < 5000) {
      return json({ ok: false, error: "Please wait a few seconds between requests." }, 429);
    }
  }

  // ------------------------------------------------------------------
  // 4. AI disabled guard (api_settings).
  // ------------------------------------------------------------------
  const { data: apiSettings } = await supabaseAdmin
    .from("api_settings")
    .select("model, is_enabled")
    .eq("provider", "deepseek")
    .maybeSingle();
  if (apiSettings && apiSettings.is_enabled === false) {
    return json({ ok: false, error: SAFE_ERRORS.disabled }, 403);
  }
  const model = apiSettings?.model || "deepseek-chat";

  // ------------------------------------------------------------------
  // 5. Load the ACTIVE prompt version (traceability: stored per request).
  // ------------------------------------------------------------------
  const { data: promptRow } = await supabaseAdmin
    .from("ai_prompts")
    .select("id, prompt_text")
    .eq("is_active", true)
    .maybeSingle();
  if (!promptRow) return json({ ok: false, error: SAFE_ERRORS.no_prompt }, 500);
  const promptId: string = promptRow.id;
  const promptText: string = promptRow.prompt_text;

  // ------------------------------------------------------------------
  // 6. Budget: reserve estimate BEFORE calling DeepSeek (two-phase).
  //    Atomic SQL functions (see supabase/migration-budget.sql):
  //      used + reserved + estimate <= budget, else reject.
  // ------------------------------------------------------------------
  const estimate = Math.ceil((text.length + promptText.length) / 4) + 150;
  const { data: reserveData, error: reserveError } = await supabaseAdmin.rpc(
    "reserve_tokens",
    { p_amount: estimate },
  );
  if (reserveError || reserveData !== true) {
    return json({ ok: false, error: SAFE_ERRORS.budget }, 429);
  }

  // ------------------------------------------------------------------
  // 7. Call DeepSeek (server-held key; 45s timeout).
  // ------------------------------------------------------------------
  const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (!apiKey) {
    await supabaseAdmin.rpc("refund_tokens", { p_amount: estimate });
    return json({ ok: false, error: SAFE_ERRORS.no_key }, 500);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  let deepseekOk = false;
  let result: QuickFixResult | null = null;
  let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  let safeError: string = SAFE_ERRORS.deepseek;

  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: promptText },
          { role: "user", content: `Problem:\n${text}` },
        ],
        response_format: { type: "json_object" },
        max_tokens: 300,
        temperature: 0.3,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        safeError = "AI provider rejected the credentials.";
      } else if (response.status === 402) {
        safeError = "AI provider account requires payment.";
      }
      console.error("[quickfix-ai] DeepSeek HTTP", response.status);
    } else {
      const payload = await response.json();
      usage = payload.usage ?? usage;
      result = parseAiJson(String(payload.choices?.[0]?.message?.content ?? ""));
      deepseekOk = true;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      safeError = "AI request timed out.";
    }
    console.error("[quickfix-ai] DeepSeek error:", err instanceof Error ? err.message : err);
  } finally {
    clearTimeout(timeout);
  }

  // ------------------------------------------------------------------
  // 8. Failure path: refund the reservation + persist a failed row +
  //    mark the problem failed, so history and reports show it.
  // ------------------------------------------------------------------
  if (!deepseekOk || !result) {
    await supabaseAdmin.rpc("refund_tokens", { p_amount: estimate });
    await supabaseAdmin.from("ai_requests").insert({
      user_id: user.id,
      problem_id: problemId,
      prompt_id: promptId,
      is_test: false,
      model,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      status: "failed",
      response_time_ms: Date.now() - startedAt,
      error_message: safeError,
    });
    if (problemId) {
      await supabaseAdmin
        .from("problems")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", problemId);
    }
    return json({ ok: false, error: safeError }, 502);
  }

  // ------------------------------------------------------------------
  // 9. Success: settle ACTUAL usage (atomic), persist request + response.
  // ------------------------------------------------------------------
  const { error: settleError } = await supabaseAdmin.rpc("settle_tokens", {
    p_reserved: estimate,
    p_actual: usage.total_tokens,
  });
  if (settleError) console.error("[quickfix-ai] settle error:", settleError.message);

  const { data: requestRow, error: insertError } = await supabaseAdmin
    .from("ai_requests")
    .insert({
      user_id: user.id,
      problem_id: problemId,
      prompt_id: promptId,
      is_test: false,
      model,
      input_tokens: usage.prompt_tokens,
      output_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      status: "success",
      response_time_ms: Date.now() - startedAt,
    })
    .select("id")
    .single();
  if (insertError || !requestRow) {
    console.error("[quickfix-ai] insert error:", insertError?.message);
    return json({ ok: false, error: SAFE_ERRORS.deepseek }, 502);
  }

  await supabaseAdmin.from("ai_responses").insert({
    request_id: requestRow.id,
    summary: result.summary,
    causes: result.causes,
    fixes: result.fixes,
  });

  if (problemId) {
    await supabaseAdmin
      .from("problems")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", problemId);
  }

  return json({
    ok: true,
    result,
    tokens: usage.total_tokens,
    requestId: requestRow.id,
  });
});
