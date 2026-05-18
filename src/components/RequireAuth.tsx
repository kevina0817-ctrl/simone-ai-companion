import { ReactNode, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles } from "lucide-react";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background bg-aurora">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Sparkles className="h-6 w-6 animate-pulse text-primary" />
          <div className="text-xs">Awakening Simone…</div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
