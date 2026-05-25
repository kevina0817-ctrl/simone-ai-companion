import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { backendAvailable, getDemoProfileForUser } from "@/lib/demo-mode";
import {
  PROFILE_DISPLAY_NAME_UPDATED,
  resolveUserDisplayName,
} from "@/lib/user-display-name";
import { supabase } from "@/integrations/supabase/client";

/** Shared display name for Home, Chat, and other UI (persona-aware, title-cased). */
export function useResolvedDisplayName(): string {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: [
      "profile",
      user?.id,
      user?.email,
      user?.user_metadata?.display_name,
      user?.user_metadata?.first_name,
      user?.user_metadata?.last_name,
    ],
    enabled: Boolean(user),
    staleTime: 0,
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

  useEffect(() => {
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ["profile"] });
    };
    window.addEventListener(PROFILE_DISPLAY_NAME_UPDATED, refresh);
    return () => window.removeEventListener(PROFILE_DISPLAY_NAME_UPDATED, refresh);
  }, [qc]);

  return resolveUserDisplayName(user, profile);
}
