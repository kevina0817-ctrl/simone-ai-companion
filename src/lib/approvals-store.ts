import { useSyncExternalStore } from "react";

export type PendingItem = {
  id: string;
  kind: "calendar" | "grocery";
  title: string;
  detail: string;
};

export type DecidedItem = PendingItem & {
  status: "approved" | "declined";
  decidedAt: number;
};

type State = {
  pending: Record<string, PendingItem["id"] extends string ? "approved" | "declined" | "pending" : never>;
  decisions: DecidedItem[];
};

const initialPending: PendingItem[] = [
  { id: "p-cal-1", kind: "calendar", title: "Calendar change: move client meeting", detail: "Today 2 PM → Tomorrow 10 AM" },
  { id: "p-gro-1", kind: "grocery", title: "Grocery budget over limit", detail: "+$24.31 over monthly" },
];

let state: { items: Record<string, { item: PendingItem; status: "pending" | "approved" | "declined"; decidedAt?: number }>; order: string[] } = {
  items: Object.fromEntries(initialPending.map((i) => [i.id, { item: i, status: "pending" as const }])),
  order: initialPending.map((i) => i.id),
};

const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

export function decide(id: string, status: "approved" | "declined") {
  const entry = state.items[id];
  if (!entry || entry.status !== "pending") return;
  state = {
    ...state,
    items: { ...state.items, [id]: { ...entry, status, decidedAt: Date.now() } },
  };
  emit();
}

export function useApprovalsSnapshot() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

export function usePending() {
  const s = useApprovalsSnapshot();
  return s.order.map((id) => s.items[id]).filter((e) => e.status === "pending").map((e) => e.item);
}

export function useStatus(id: string) {
  const s = useApprovalsSnapshot();
  return s.items[id]?.status ?? "pending";
}

export function useRecentDecisions() {
  const s = useApprovalsSnapshot();
  return s.order
    .map((id) => s.items[id])
    .filter((e) => e.status !== "pending")
    .sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0))
    .map((e) => ({ ...e.item, status: e.status as "approved" | "declined", decidedAt: e.decidedAt! }));
}
