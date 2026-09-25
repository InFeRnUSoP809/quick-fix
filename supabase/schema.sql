-- ============================================================================
-- QuickFix AI — Supabase schema
-- Mirrors the app's data model 1:1 (tables, indexes, row-level security).
-- Run this once in the Supabase SQL Editor (Database → SQL Editor → New query).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Users + roles
-- auth.users is managed by Supabase Auth (email+password enabled in dashboard).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text,
  is_anonymous boolean not null default false,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile whenever a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, is_anonymous)
  values (new.id, new.email, false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- First registered user automatically becomes admin (bootstrap).
create or replace function public.promote_first_admin()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where role = 'admin') then
    update public.profiles set role = 'admin' where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists promote_first_admin_trigger on public.profiles;
create trigger promote_first_admin_trigger
  after insert on public.profiles
  for each row execute function public.promote_first_admin();

-- ---------------------------------------------------------------------------
-- Problems: one row per "Get Quick Fix" click
-- ---------------------------------------------------------------------------
create table if not exists public.problems (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  problem_text text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists problems_user_created_idx
  on public.problems (user_id, created_at desc);
create index if not exists problems_status_idx on public.problems (status);

-- ---------------------------------------------------------------------------
-- AI requests: one row per DeepSeek call (success or failure).
-- Token usage here is the source of truth for the 20,000-token budget.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  problem_id uuid references public.problems (id) on delete set null,
  prompt_id uuid,
  is_test boolean not null default false,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  status text not null check (status in ('success', 'failed')),
  response_time_ms integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists ai_requests_problem_idx
  on public.ai_requests (problem_id);
create index if not exists ai_requests_user_idx on public.ai_requests (user_id);
create index if not exists ai_requests_created_idx
  on public.ai_requests (created_at desc);

-- ---------------------------------------------------------------------------
-- AI responses: structured output for successful requests
-- ---------------------------------------------------------------------------
create table if not exists public.ai_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ai_requests (id) on delete cascade,
  summary text not null,
  causes jsonb not null,
  fixes jsonb not null
);
create index if not exists ai_responses_request_idx
  on public.ai_responses (request_id);

-- ---------------------------------------------------------------------------
-- Versioned AI prompts (old versions are never overwritten)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_prompts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  prompt_text text not null,
  version integer not null,
  is_active boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists ai_prompts_one_active
  on public.ai_prompts (is_active) where is_active;

-- ---------------------------------------------------------------------------
-- API settings (provider/model/enabled). The API key itself NEVER lives here —
-- it stays in server-side environment variables (see DEEPSEEK_API_KEY).
-- ---------------------------------------------------------------------------
create table if not exists public.api_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique default 'deepseek',
  model text not null default 'deepseek-chat',
  is_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- System settings: budget + limits (reserved keys listed in comments)
-- ---------------------------------------------------------------------------
create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
-- Reserved keys: 'ai_token_budget' (hard cap), 'ai_tokens_used' (counter),
-- 'max_output_tokens', 'max_problem_length'.

-- Seed the defaults.
insert into public.system_settings (key, value) values
  ('ai_token_budget', '20000'),
  ('max_output_tokens', '300'),
  ('max_problem_length', '1000')
on conflict (key) do nothing;

-- Seed the default prompt (v1) and DeepSeek settings row.
insert into public.ai_prompts (name, prompt_text, version, is_active)
select 'Default QuickFix prompt', '
You are QuickFix AI.

Analyze the user''s problem and provide practical general suggestions.

Return valid JSON only:

{
  "summary": "short summary",
  "causes": ["cause 1", "cause 2", "cause 3"],
  "fixes": ["fix 1", "fix 2", "fix 3"]
}

Rules:
- Exactly 3 causes.
- Exactly 3 fixes.
- Keep each cause and fix under 12 words.
- Keep the summary under 30 words.
- Do not invent facts.
- Avoid dangerous instructions.
- Recommend an appropriate professional when necessary (doctor, lawyer, electrician, emergency services) instead of giving unsafe instructions.
', 1, true
where not exists (select 1 from public.ai_prompts);

insert into public.api_settings (provider, model, is_enabled)
values ('deepseek', 'deepseek-chat', true)
on conflict (provider) do nothing;

-- ============================================================================
-- Row-Level Security
-- ============================================================================

alter table public.problems enable row level security;
alter table public.ai_requests enable row level security;
alter table public.ai_responses enable row level security;
alter table public.ai_prompts enable row level security;
alter table public.api_settings enable row level security;
alter table public.system_settings enable row level security;

-- Helper: is the caller an admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Profiles: users read/update their own row; admins read all.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid() or public.is_admin());

-- Problems: owner-only writes; owner or admin reads.
drop policy if exists problems_select on public.problems;
create policy problems_select on public.problems
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists problems_insert on public.problems;
create policy problems_insert on public.problems
  for insert with check (user_id = auth.uid());
drop policy if exists problems_update on public.problems;
create policy problems_update on public.problems
  for update using (user_id = auth.uid());

-- AI requests/responses: readable by owner + admin; writes happen through
-- the service-role server route (RLS bypassed by the service key).
drop policy if exists ai_requests_select on public.ai_requests;
create policy ai_requests_select on public.ai_requests
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists ai_responses_select on public.ai_responses;
create policy ai_responses_select on public.ai_responses
  for select using (
    exists (
      select 1 from public.ai_requests r
      where r.id = ai_responses.request_id
        and (r.user_id = auth.uid() or public.is_admin())
    )
  );

-- Prompts/settings: read for all signed-in users, write for admins only.
drop policy if exists ai_prompts_select on public.ai_prompts;
create policy ai_prompts_select on public.ai_prompts
  for select using (auth.uid() is not null);
drop policy if exists ai_prompts_write on public.ai_prompts;
create policy ai_prompts_write on public.ai_prompts
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists api_settings_select on public.api_settings;
create policy api_settings_select on public.api_settings
  for select using (auth.uid() is not null);
drop policy if exists api_settings_write on public.api_settings;
create policy api_settings_write on public.api_settings
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists system_settings_select on public.system_settings;
create policy system_settings_select on public.system_settings
  for select using (auth.uid() is not null);
drop policy if exists system_settings_write on public.system_settings;
create policy system_settings_write on public.system_settings
  for all using (public.is_admin()) with check (public.is_admin());
