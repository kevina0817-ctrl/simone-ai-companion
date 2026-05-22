import { ReactNode, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { backendAvailable } from "@/lib/demo-mode";
import { SimoneBrandHeader, SimoneLogoMark } from "@/components/SimoneBrandHeader";
import {
  buildDisplayNameFromParts,
  syncProfileDisplayNameFromUser,
} from "@/lib/user-display-name";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background bg-aurora">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <SimoneLogoMark className="h-16 w-16 animate-pulse" />
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
      if (mode === "signup") {
        const displayName = buildDisplayNameFromParts(firstName, lastName);
        if (!firstName.trim() || !lastName.trim()) {
          toast.error("Please enter your first and last name.");
          return;
        }
        if (!displayName) {
          toast.error("Please enter a valid name.");
          return;
        }
      }

      setBusy(true);
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        setBusy(false);
        if (error) toast.error(error.message);
        return;
      }

      const displayName = buildDisplayNameFromParts(firstName, lastName);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            display_name: displayName,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          },
        },
      });
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }

      if (data.session?.user) {
        await supabase.from("profiles").upsert({
          id: data.session.user.id,
          display_name: displayName,
        });
        await syncProfileDisplayNameFromUser(data.session.user);
      }

      toast.success("Check your email to confirm.");
    };

    const toggleMode = () => {
      setMode(mode === "signin" ? "signup" : "signin");
      setFirstName("");
      setLastName("");
    };
    return (
      <div className="flex min-h-screen items-center justify-center bg-background bg-aurora p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card/60 p-6 backdrop-blur">
          <SimoneBrandHeader />
          {mode === "signup" && (
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="text"
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                required
              />
              <Input
                type="text"
                placeholder="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                required
              />
            </div>
          )}
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
          <button
            type="button"
            onClick={toggleMode}
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
