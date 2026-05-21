import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { backendAvailable, demoUser } from "@/lib/demo-mode";
import { setApprovalsDecideContext } from "@/lib/approvals-store";

/** Registers query client + user so Approve on schedule items updates Homepage. */
export function ApprovalsDecideBridge() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) {
      setApprovalsDecideContext(null);
      return;
    }
    const userId = backendAvailable ? user.id : demoUser.id;
    setApprovalsDecideContext({ userId, queryClient: qc });
    return () => setApprovalsDecideContext(null);
  }, [user, qc]);

  return null;
}
