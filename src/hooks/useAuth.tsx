import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { backendAvailable, demoUser } from "@/lib/demo-mode";
import { applyPersonaForUser } from "@/lib/persona-registry";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({ user: null, session: null, loading: true, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(backendAvailable ? null : ({ user: demoUser } as Session));
  const [loading, setLoading] = useState(backendAvailable);

  useEffect(() => {
    if (!backendAvailable) {
      applyPersonaForUser(demoUser);
      return;
    }
    let active = true;
    const fallback = window.setTimeout(() => {
      if (active) setLoading(false);
    }, 3000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (!active) return;
      setSession(s);
      setLoading(false);
      applyPersonaForUser(s?.user);
    });

    supabase.auth.getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        applyPersonaForUser(data.session?.user);
      })
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      window.clearTimeout(fallback);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        signOut: async () => {
          if (backendAvailable) await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
