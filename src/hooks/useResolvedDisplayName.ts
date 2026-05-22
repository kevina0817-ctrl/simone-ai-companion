import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { backendAvailable, getDemoProfileForUser } from "@/lib/demo-mode";
import { resolveUserDisplayName } from "@/lib/user-display-name";
import { supabase } from "@/integrations/supabase/client";

/** Shared display name for Home, Chat, and other UI (persona-aware, title-cased). */
export function useResolvedDisplayName(): string {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id, user?.email],
    enabled: Boolean(user),
    queryFn: async () => {
      if (!backendAvailable) return getDemoProfileForUser(user?.email);
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return resolveUserDisplayName(user, profile);
}
