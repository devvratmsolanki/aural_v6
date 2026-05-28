import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

interface Profile { name: string | null; avatar_url: string | null }

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  const fetchProfile = useCallback(async (uid: string) => {
    const { data } = await supabase.from("profiles").select("name,avatar_url").eq("id", uid).maybeSingle();
    setProfile(data ?? null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    await fetchProfile(user.id);
  }, [user, fetchProfile]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(async () => {
          const { data } = await supabase.from("user_roles").select("role").eq("user_id", s.user.id);
          setIsAdmin(!!data?.some((r) => r.role === "admin"));
          await fetchProfile(s.user.id);
        }, 0);
      } else {
        setIsAdmin(false);
        setProfile(null);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        // Resolve the role BEFORE clearing `loading`, otherwise guarded routes
        // render with isAdmin=false for a tick and flash a redirect for admins.
        const { data } = await supabase.from("user_roles").select("role").eq("user_id", s.user.id);
        setIsAdmin(!!data?.some((r) => r.role === "admin"));
        fetchProfile(s.user.id);
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    // Block disabled accounts. Only explicitly 'disabled' blocks; null/missing
    // or any other status is treated as allowed, so the admin can never lock
    // themselves out due to a missing/unexpected profile row.
    if (signInData.user) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", signInData.user.id)
        .maybeSingle();
      if ((prof as { status?: string } | null)?.status === "disabled") {
        await supabase.auth.signOut();
        return { error: "Your account has been disabled." };
      }
    }
    return { error: null };
  };

  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/`, data: { name } },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    window.dispatchEvent(new CustomEvent("aural:stop"));
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider value={{ user, session, loading, isAdmin, profile, refreshProfile, signIn, signUp, signOut }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
};
