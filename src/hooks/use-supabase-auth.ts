import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabaseClient";

/*
 * Supabase auth + data layer (migration path from Convex).
 *
 * Same external API as the Convex-based useAuth()/useAuthActions() hooks, so
 * pages can swap providers without touching their render logic. Activates
 * automatically once VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set.
 */

export interface SupabaseProfile {
  id: string;
  email: string | null;
  name: string | null;
  is_anonymous: boolean;
  role: "user" | "admin";
}

interface SupabaseAuthValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: SupabaseProfile | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export function useSupabaseAuth(): SupabaseAuthValue {
  const [profile, setProfile] = useState<SupabaseProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabaseConfigured) {
      setIsLoading(false);
      return;
    }

    let active = true;

    async function loadProfile(userId: string) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, name, is_anonymous, role")
        .eq("id", userId)
        .single();
      if (!active) return;
      if (error || !data) {
        setProfile(null);
      } else {
        setProfile(data as SupabaseProfile);
      }
      setIsLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const session = data.session;
      if (session?.user) {
        void loadProfile(session.user.id);
      } else {
        setProfile(null);
        setIsLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user) {
        void loadProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithPassword = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUpWithPassword = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return {
    isLoading,
    isAuthenticated: !!profile,
    user: profile,
    signInWithPassword,
    signUpWithPassword,
    signOut,
  };
}

export const SupabaseAuthContext = createContext<SupabaseAuthValue | null>(null);

export function useSupabaseAuthValue(): SupabaseAuthValue {
  const ctx = useContext(SupabaseAuthContext);
  if (!ctx) throw new Error("SupabaseAuthContext provider missing");
  return ctx;
}
