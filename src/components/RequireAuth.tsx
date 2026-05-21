import { ReactNode, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles } from "lucide-react";

const SIMONE_LOGO = "/simone-logo.png";
const EMPATHY_LINE =
  "I listen with care — here to understand your day, not just manage it.";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { backendAvailable } from "@/lib/demo-mode";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background bg-aurora">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Sparkles className="h-6 w-6 animate-pulse text-primary" />
          <div className="text-xs">Awakening Simone…</div>
        </div>
      </div>
    );
  }

  if (!backendAvailable) {
    return <>{children}</>;
  }

  if (!user) {
    const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      const { error } =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
      setBusy(false);
      if (error) toast.error(error.message);
      else if (mode === "signup") toast.success("Check your email to confirm.");
    };
    return (
      <div className="flex min-h-screen items-center justify-center bg-background bg-aurora p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card/60 p-6 backdrop-blur">
          <div className="flex flex-col items-center gap-3 text-center">
            <img
              src={SIMONE_LOGO}
              alt="Simone"
              width={112}
              height={112}
              className="h-28 w-28 object-contain"
            />
            <div>
              <h1 className="font-display text-xl text-foreground">Welcome to Simone</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{EMPATHY_LINE}</p>
            </div>
          </div>
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
