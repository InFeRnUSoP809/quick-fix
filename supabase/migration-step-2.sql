-- ============================================================================
-- QuickFix AI — Migration step 2 (run ONCE in the SQL Editor, after schema.sql)
--
-- Adds:
--   1. Atomic budget functions (reserve/settle/refund/reset)
--      NOTE: computed in PL/pgSQL variables — an unqualified `value` inside
--      ON CONFLICT DO UPDATE is ambiguous against `excluded` (SQLSTATE 42702),
--      which used to make reserve_tokens fail at runtime and mask itself as
--      "AI usage limit reached" at zero usage.
--   2. Admin RPCs for prompts, API settings, system settings
--   3. A guard trigger so non-admins can never change roles
--   4. The problems_delete policy (owner or admin may delete)
--
-- Idempotent: safe to run again.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Atomic budget functions (used by the quickfix-ai Edge Function)
-- ---------------------------------------------------------------------------

-- Reserve tokens BEFORE a DeepSeek call. Returns true when reserved.
drop function if exists public.reserve_tokens(integer);
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
    (select (s.value #>> '{}')::integer from public.system_settings s where s.key = 'ai_token_budget'),
    20000
  ) into budget_value;

  select coalesce(
    (select (s.value #>> '{}')::integer from public.system_settings s where s.key = 'ai_tokens_used'),
    0
  ) into used_value;

  -- Compute the new counter entirely in a variable (avoids the 42702
  -- ambiguity between the target row and `excluded.value`).
  used_value := used_value + p_amount;

  if used_value > budget_value then
    return false;
  end if;

  insert into public.system_settings (key, value)
  values ('ai_tokens_used', to_jsonb(used_value))
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now();

  return true;
end;
$$;

-- Replace the reservation with the ACTUAL usage reported by DeepSeek.
drop function if exists public.settle_tokens(integer, integer);
create function public.settle_tokens(p_reserved integer, p_actual integer)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.system_settings
  set value = to_jsonb(greatest(0,
        coalesce((system_settings.value #>> '{}')::integer, 0) - p_reserved + p_actual)),
      updated_at = now()
  where key = 'ai_tokens_used';
end;
$$;

-- Release a reservation (the call failed or was never made).
drop function if exists public.refund_tokens(integer);
create function public.refund_tokens(p_amount integer)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.system_settings
  set value = to_jsonb(greatest(0,
        coalesce((system_settings.value #>> '{}')::integer, 0) - p_amount)),
      updated_at = now()
  where key = 'ai_tokens_used';
end;
$$;

-- Admin reset (new budget cycle). Requires the admin role.
create or replace function public.admin_set_tokens_used(p_used integer)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  insert into public.system_settings (key, value)
  values ('ai_tokens_used', to_jsonb(greatest(0, p_used)))
  on conflict (key) do update
    set value = to_jsonb(greatest(0, p_used)), updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Admin RPCs (all re-verify the admin role server-side)
-- ---------------------------------------------------------------------------

-- Save a NEW prompt version atomically: deactivates all others and inserts
-- the new active one in the same transaction. Old versions are never edited.
create or replace function public.save_prompt_version(p_name text, p_prompt_text text)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_version integer;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_prompt_text !~ '\{\{\s*problem\s*\}\}' then
    raise exception 'Prompt must include the {{problem}} variable.';
  end if;
  if length(p_prompt_text) > 8000 then
    raise exception 'Prompt is too long (max 8000 characters).';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Prompt name is required.';
  end if;

  update public.ai_prompts set is_active = false where is_active;

  insert into public.ai_prompts (name, prompt_text, version, is_active, created_by)
  select trim(p_name), p_prompt_text, coalesce(max(version), 0) + 1, true, auth.uid()
  from public.ai_prompts
  returning version into v_version;

  return v_version;
end;
$$;

-- Activate a previous prompt version (rollback). Exactly one stays active.
create or replace function public.activate_prompt(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if not exists (select 1 from public.ai_prompts where id = p_id) then
    raise exception 'Prompt not found.';
  end if;
  update public.ai_prompts set is_active = false where is_active and id <> p_id;
  update public.ai_prompts set is_active = true where id = p_id;
end;
$$;

-- Update the DeepSeek model / enable flag (validated server-side).
create or replace function public.admin_update_api_settings(p_model text, p_enabled boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_model not in ('deepseek-chat', 'deepseek-reasoner') then
    raise exception 'Unsupported model. Choose one from the list.';
  end if;
  insert into public.api_settings (provider, model, is_enabled)
  values ('deepseek', p_model, p_enabled)
  on conflict (provider) do update
    set model = excluded.model,
        is_enabled = excluded.is_enabled,
        updated_at = now();
end;
$$;

-- Update a system setting. Critical limits can be tightened but never
-- disabled (sane minimums are enforced here, server-side).
create or replace function public.admin_update_setting(p_key text, p_value integer)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_min integer;
  v_max integer;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_value is null or p_value <= 0 then
    raise exception 'Value must be a positive number.';
  end if;

  case p_key
    when 'ai_token_budget' then v_min := 1000;    v_max := 5000000;
    when 'max_output_tokens' then v_min := 100;   v_max := 2000;
    when 'max_problem_length' then v_min := 50;   v_max := 4000;
    else raise exception 'Unknown setting.';
  end case;

  if p_value < v_min or p_value > v_max then
    raise exception 'Value must be between % and %.', v_min, v_max;
  end if;

  insert into public.system_settings (key, value)
  values (p_key, to_jsonb(p_value))
  on conflict (key) do update
    set value = to_jsonb(p_value), updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Security: only admins may change roles
-- ---------------------------------------------------------------------------

create or replace function public.protect_profiles()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.id <> old.id then
    raise exception 'Cannot change profile id.';
  end if;
  if old.role is distinct from new.role and not public.is_admin() then
    raise exception 'FORBIDDEN: only admins can change roles.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.protect_profiles();

-- ---------------------------------------------------------------------------
-- 4. Delete policy: the owner (or an admin) may delete their problems.
--    (ai_requests/ai_responses cascade/set-null via foreign keys.)
-- ---------------------------------------------------------------------------
drop policy if exists problems_delete on public.problems;
create policy problems_delete on public.problems
  for delete using (user_id = auth.uid() or public.is_admin());
