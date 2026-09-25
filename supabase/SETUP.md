# Supabase setup for QuickFix AI

Follow these steps once. After them, the app runs fully on Supabase (Postgres + Auth) and the only external service left is DeepSeek.

## 1. Run the schema

1. Open https://supabase.com/dashboard/project/oqqsjhrtdydzotsvkimg/sql/new
2. Paste the entire contents of `supabase/schema.sql` and click **Run**.
3. You should see `Success. No rows returned`. This creates:
   - `profiles` (auto-created on signup, first user auto-promoted to admin)
   - `problems`, `ai_requests`, `ai_responses` (with RLS: owner-only data)
   - `ai_prompts` (versioned, one active), `api_settings`, `system_settings`
   - Seed rows: default prompt v1 (active), DeepSeek settings, 20,000-token budget

## 2. Enable email + password auth

1. Go to **Authentication → Providers**.
2. Make sure **Email** is ON and **Confirm email** is OFF (instant sign-in while developing; you can re-enable verification later).
3. Under **Authentication → URL Configuration**, set:
   - Site URL: your Freebuff preview/production URL
   - Redirect URLs: add your Freebuff preview/production URL

## 3. Add the DeepSeek key

Put it in the Freebuff project's **Keys/API keys** tab:

- `DEEPSEEK_API_KEY` = `sk-…` (your DeepSeek key)

Never put it in source files or in Supabase tables — it must stay server-side only. The backend reads it at request time; the admin console shows whether it's detected.

## 4. What I still need from you

The anon key alone cannot run the schema or verify tables — the SQL editor step above must be done by you in the dashboard (or paste me a service_role key in chat, which I will use only for the initial setup and you should rotate afterwards).

After you've run the schema, tell me **"schema done"** and I will:

1. Point the app's data + auth layer at Supabase end-to-end
2. Verify the migration compiles and the schema seeded correctly
3. Report which pieces (budget ledger, prompt versioning) need a server route for the service-role key before production AI calls work

## Security notes

- The anon key is public by design — safe in the browser, protected by RLS.
- RLS is already configured: users see only their own problems/results; admins see all.
- The service_role key (used only for server-side AI persistence if you share it) must never be committed — rotate it after setup if it was pasted in chat.
- DeepSeek key: server-side only. The browser never sees it.
