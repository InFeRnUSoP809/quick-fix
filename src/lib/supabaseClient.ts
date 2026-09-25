import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client (migration path from Convex).
 *
 * Inert until the user adds VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in
 * the project's Keys/API-keys UI — the app keeps running on Convex until then.
 * Once keys exist, Supabase Auth (email+password) and the Postgres schema in
 * supabase/schema.sql power the app instead.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient = createClient(
  url ?? "https://placeholder.supabase.co",
  anonKey ?? "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
