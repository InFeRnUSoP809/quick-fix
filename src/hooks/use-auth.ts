/**
 * Auth hook — now backed by Supabase Auth (email + password).
 *
 * Re-exported from the unified provider so every page keeps importing from
 * "@/hooks/use-auth" with the same API: { isLoading, isAuthenticated, user,
 * signIn, signUp, signOut }. The previous Convex-auth implementation has been
 * replaced as part of the Supabase migration.
 */
export { useAuth } from "@/lib/authProvider";
