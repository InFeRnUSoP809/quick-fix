import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabaseClient";

/*
 * Unified auth provider.
 *
 * The Supabase schema is now live, so Supabase Auth (email + password) is the
 * active provider. Exposes the same useAuth() API the app already consumes
 * (isLoading / isAuthenticated / user / signIn / signOut), so pages keep
 * working — they just import useAuth from here instead of the Convex hook.
 */

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  role: "user" | "admin";
}

interface AuthValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Loads the profile row for a signed-in auth user. Self-heals the case where
 * the user registered before the schema (and its profile trigger) existed:
 * if no row is found, one is upserted — and the promote_first_admin trigger
 * fires on that insert, so a legitimate first user still becomes admin.
 */
async function loadProfile(
  userId: string,
  email: string | null,
): Promise<AuthUser | null> {
  let { data } = await supabase
    .from("profiles")
    .select("id, email, name, role")
    .eq("id", userId)
    .maybeSingle();

  if (!data) {
    // Profile missing (pre-schema signup): create it now.
    await supabase
      .from("profiles")
      .upsert({ id: userId, email }, { onConflict: "id" });
    const refetched = await supabase
      .from("profiles")
      .select("id, email, name, role")
      .eq("id", userId)
      .maybeSingle();
    data = refetched.data;
  }

  if (!data) return null;
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    role: (data.role as "user" | "admin") ?? "user",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabaseConfigured) {
      setIsLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      const sessionUser = data.session?.user;
      if (sessionUser) {
        setUser(
          await loadProfile(sessionUser.id, sessionUser.email ?? null),
        );
      }
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;
      const sessionUser = session?.user;
      if (sessionUser) {
        setUser(
          await loadProfile(sessionUser.id, sessionUser.email ?? null),
        );
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      isLoading,
      isAuthenticated: !!user,
      user,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      },
      signUp: async (email, password) => {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      },
      signOut: async () => {
        await supabase.auth.signOut();
        setUser(null);
      },
    }),
    [user, isLoading],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
