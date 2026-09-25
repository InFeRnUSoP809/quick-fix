-- ============================================================================
-- QuickFix AI — Budget RPC repair (run ONCE in the SQL Editor)
--
-- Symptom: every Quick Fix returns "AI usage limit reached. The token budget
-- is exhausted." even though the AI has never been used.
--
-- Cause: the reserve_tokens()/settle_tokens()/refund_tokens() SQL functions
-- are missing or stale (migration-step-2.sql never fully applied), or
-- PostgREST has not picked them up. The Edge Function's budget check then
-- fails before ever calling DeepSeek.
--
-- This script:
--   1. Recreates the three atomic budget functions (exact, current versions).
--   2. Smoke-tests them in-transaction (reserve 10, settle back to 0).
--   3. Resets ai_tokens_used to 0 (you have made no successful AI calls).
--   4. Reloads the PostgREST schema cache so the API sees the new functions.
--   5. Prints diagnostics so you can verify.
--
-- Idempotent: safe to run again.
-- ============================================================================

-- 1) Recreate the budget functions -------------------------------------------
drop function if exists public.reserve_tokens(integer);
drop function if exists public.settle_tokens(integer, integer);
drop function if exists public.refund_tokens(integer);

create function public.reserve_tokens(p_amount integer)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  budget_value integer;
  used_value   integer;
begin
  if p_amount is null or p_amount < 0 then
    p_amount := 0;
  end if;

  select coalesce(
    (select (value #>> '{}')::integer from public.system_settings where key = 'ai_token_budget'),
    20000
  ) into budget_value;

  select coalesce(
    (select (value #>> '{}')::integer from public.system_settings where key = 'ai_tokens_used'),
    0
  ) into used_value;

  if used_value + p_amount > budget_value then
    return false;
  end if;

  insert into public.system_settings (key, value)
  values ('ai_tokens_used', to_jsonb(p_amount))
  on conflict (key) do update
    set value = to_jsonb((value #>> '{}')::integer + p_amount),
        updated_at = now();

  return true;
end;
$$;

create function public.settle_tokens(p_reserved integer, p_actual integer)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.system_settings
  set value = to_jsonb(greatest(0, (value #>> '{}')::integer - p_reserved + p_actual)),
      updated_at = now()
  where key = 'ai_tokens_used';
end;
$$;

create function public.refund_tokens(p_amount integer)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.system_settings
  set value = to_jsonb(greatest(0, (value #>> '{}')::integer - p_amount)),
      updated_at = now()
  where key = 'ai_tokens_used';
end;
$$;

-- 2) Smoke test: reserve 10, then settle back to 0 ----------------------------
-- The two result rows below should both read `true` / clean.
select public.reserve_tokens(10) as smoke_reserve_ok;
select public.settle_tokens(10, 0) as smoke_settle_done;

-- 3) Reset the counter (no successful AI calls have happened yet) -------------
insert into public.system_settings (key, value)
values ('ai_tokens_used', to_jsonb(0))
on conflict (key) do update
  set value = to_jsonb(0), updated_at = now();

-- 4) Make PostgREST pick up the new/changed functions immediately -------------
notify pgrst, 'reload schema';

-- 5) Diagnostics — check the output of this final statement -------------------
select
  'functions' as check,
  (select count(*) from information_schema.routines
    where routine_schema = 'public'
      and routine_name in ('reserve_tokens','settle_tokens','refund_tokens')
  ) || '/3 budget functions exist' as result
union all
select
  'budget settings',
  (select value::text from public.system_settings where key = 'ai_token_budget') ||
    ' budget / ' ||
    (select value::text from public.system_settings where key = 'ai_tokens_used') || ' used';
