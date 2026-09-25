-- ============================================================================
-- QuickFix AI — atomic budget functions (run once in the SQL Editor, after
-- schema.sql). These make the two-phase token budget concurrency-safe.
-- ============================================================================

-- Reserve tokens BEFORE a DeepSeek call. Returns true when reserved, false
-- when the budget cannot cover it. Atomic: the WHERE clause re-checks the
-- cap inside the UPDATE, so concurrent calls can never overshoot.
create or replace function public.reserve_tokens(p_amount integer)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  budget_value integer;
  used_value integer;
begin
  select coalesce((select (value)::integer from public.system_settings where key = 'ai_token_budget'), 20000)
    into budget_value;
  select coalesce((select (value)::integer from public.system_settings where key = 'ai_tokens_used'), 0)
    into used_value;

  if used_value + p_amount > budget_value then
    return false;
  end if;

  insert into public.system_settings (key, value) values ('ai_tokens_used', p_amount)
  on conflict (key) do update set value = (value)::integer + p_amount, updated_at = now();

  return true;
end;
$$;

-- Replace the reservation with ACTUAL usage reported by DeepSeek.
create or replace function public.settle_tokens(p_reserved integer, p_actual integer)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.system_settings
  set value = greatest(0, (value)::integer - p_reserved + p_actual),
      updated_at = now()
  where key = 'ai_tokens_used';
end;
$$;

-- Release a reservation (call failed or was never made).
create or replace function public.refund_tokens(p_amount integer)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.system_settings
  set value = greatest(0, (value)::integer - p_amount),
      updated_at = now()
  where key = 'ai_tokens_used';
end;
$$;

-- Admin reset (new budget cycle).
create or replace function public.admin_set_tokens_used(p_used integer)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  insert into public.system_settings (key, value) values ('ai_tokens_used', greatest(0, p_used))
  on conflict (key) do update set value = greatest(0, p_used), updated_at = now();
end;
$$;

-- Per-user request count over a window (used by the admin usage view).
create or replace function public.count_user_requests(p_user uuid, p_since timestamptz)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select count(*)::integer from public.ai_requests
  where user_id = p_user and created_at >= p_since;
$$;
