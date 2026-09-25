import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client.
 *
 * The project URL and anon key are PUBLIC by design (they ship in the browser
 * bundle regardless — data access is protected by row-level security on the
 * server). They are baked in below as defaults so the app works without env
 * injection; VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY override them if set.
 *
 * Secrets (DeepSeek key, service_role key) are NOT here and must never be —
 * they stay server-side.
 */

const DEFAULT_URL = "https://oqqsjhrtdydzotsvkimg.supabase.co";
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xcXNqaHJ0ZHlkem90c3ZraW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNDYxOTUsImV4cCI6MjEwNTkyMjE5NX0.XcC_tnRfFIJLFfFffE7zeY2J7qKG_BSMJkLOetZUpgc";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? DEFAULT_URL;
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? DEFAULT_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
