import type { RoutineProposal } from "@/lib/routine-proposal";

const STORAGE_KEY = "simone-pending-routine-proposal";

/** Server-side pending proposals (chat server functions). */
const serverPendingByUser = new Map<string, RoutineProposal>();

export function getPendingRoutineProposal(userId: string): RoutineProposal | null {
  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(`${STORAGE_KEY}:${userId}`);
      return raw ? (JSON.parse(raw) as RoutineProposal) : null;
    } catch {
      return null;
    }
  }
  return serverPendingByUser.get(userId) ?? null;
}

export function setPendingRoutineProposal(userId: string, proposal: RoutineProposal): void {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(`${STORAGE_KEY}:${userId}`, JSON.stringify(proposal));
    return;
  }
  serverPendingByUser.set(userId, proposal);
}

export function clearPendingRoutineProposal(userId: string): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(`${STORAGE_KEY}:${userId}`);
    return;
  }
  serverPendingByUser.delete(userId);
}

export function getServerPendingRoutineProposal(userId: string): RoutineProposal | null {
  return serverPendingByUser.get(userId) ?? null;
}

export function setServerPendingRoutineProposal(userId: string, proposal: RoutineProposal): void {
  serverPendingByUser.set(userId, proposal);
}

export function clearServerPendingRoutineProposal(userId: string): void {
  serverPendingByUser.delete(userId);
}
