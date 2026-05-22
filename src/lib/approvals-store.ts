import type { QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import type { PendingOrder } from "@/lib/pending-order";
import { formatApprovalOrderDetail } from "@/lib/order-approval";
import type { ScheduleItem } from "@/lib/schedule-item";
import { toast } from "sonner";
import { recordApprovedOrderSpend } from "@/lib/budget-store";
import { addPendingOrder, getPendingOrder, setPendingOrderStatus } from "@/lib/pending-orders-store";

export type PendingItemKind = "calendar" | "grocery" | "order";

export type PendingItem = {
  id: string;
  kind: PendingItemKind;
  title: string;
  detail: string;
  /** Shopping order payload — Approvals → Orders after approve */
  orderId?: string;
  /** Schedule event payload — Approvals → Homepage after approve (never Orders) */
  scheduleEvent?: ScheduleItem;
  /** Purchase would exceed monthly budget */
  exceedsBudget?: boolean;
  budgetOverBy?: number;
};

export type DecidedItem = PendingItem & {
  status: "approved" | "declined";
  decidedAt: number;
};

export type ApprovalsDecideContext = {
  userId: string;
  queryClient: QueryClient;
};

const initialPending: PendingItem[] = [
  {
    id: "p-cal-1",
    kind: "calendar",
    title: "Calendar change: move client meeting",
    detail: "Today 2 PM → Tomorrow 10 AM",
  },
  {
    id: "p-gro-1",
    kind: "grocery",
    title: "Grocery budget over limit",
    detail: "+$24.31 over monthly",
  },
];

let state: {
  items: Record<
    string,
    { item: PendingItem; status: "pending" | "approved" | "declined"; decidedAt?: number }
  >;
  order: string[];
} = {
  items: Object.fromEntries(initialPending.map((i) => [i.id, { item: i, status: "pending" as const }])),
  order: initialPending.map((i) => i.id),
};

let decideContext: ApprovalsDecideContext | null = null;

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function setApprovalsDecideContext(ctx: ApprovalsDecideContext | null) {
  decideContext = ctx;
}

function formatScheduleDetail(item: ScheduleItem): string {
  const when = new Date(item.start_time).toLocaleString([], {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const parts = [when, item.level];
  if (item.subtitle) parts.push(item.subtitle);
  return parts.join(" • ");
}

export async function decide(
  id: string,
  status: "approved" | "declined",
  ctx?: ApprovalsDecideContext,
) {
  const entry = state.items[id];
  if (!entry || entry.status !== "pending") return;

  const activeCtx = ctx ?? decideContext;

  if (status === "approved" && entry.item.scheduleEvent) {
    if (!activeCtx) {
      toast.error("Could not update today's schedule — try again");
      return;
    }
    try {
      const { commitScheduleToTimeline } = await import("@/lib/apply-chat-schedule");
      const committed = await commitScheduleToTimeline(
        activeCtx.queryClient,
        entry.item.scheduleEvent,
        activeCtx.userId,
      );
      toast.success(`Added “${committed.title}” to today's schedule`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add event to today's schedule");
      return;
    }
  }

  state = {
    ...state,
    items: { ...state.items, [id]: { ...entry, status, decidedAt: Date.now() } },
  };

  if (entry.item.orderId) {
    setPendingOrderStatus(entry.item.orderId, status === "approved" ? "approved" : "declined");
    if (status === "approved") {
      const order = getPendingOrder(entry.item.orderId);
      if (order) recordApprovedOrderSpend(order);
    }
  }

  emit();
}

/** Shopping order → Approvals only until approved; budget checked on Approve. */
export function addPendingOrderApproval(order: PendingOrder) {
  const item: PendingItem = {
    id: order.id,
    kind: "order",
    title: order.title,
    detail: formatApprovalOrderDetail(order),
    orderId: order.id,
  };
  addPendingOrder(order);
  if (state.items[order.id]) {
    state = {
      ...state,
      items: {
        ...state.items,
        [order.id]: { item, status: "pending" as const },
      },
    };
  } else {
    state = {
      items: { ...state.items, [order.id]: { item, status: "pending" as const } },
      order: [order.id, ...state.order.filter((oid) => oid !== order.id)],
    };
  }
  emit();
}

/** Schedule event → Approvals first; Homepage timeline only after approve. */
export function addPendingScheduleApproval(item: ScheduleItem) {
  const approvalId = `schedule-approval-${item.id}`;
  const pendingItem: PendingItem = {
    id: approvalId,
    kind: "calendar",
    title: item.title,
    detail: formatScheduleDetail(item),
    scheduleEvent: item,
  };
  if (state.items[approvalId]) {
    state = {
      ...state,
      items: {
        ...state.items,
        [approvalId]: { item: pendingItem, status: "pending" as const },
      },
    };
  } else {
    state = {
      items: { ...state.items, [approvalId]: { item: pendingItem, status: "pending" as const } },
      order: [approvalId, ...state.order.filter((oid) => oid !== approvalId)],
    };
  }
  emit();
}

/** Reset pending approvals (demo / sample personas). */
export function resetApprovalsPending(items: PendingItem[]) {
  state = {
    items: Object.fromEntries(items.map((i) => [i.id, { item: i, status: "pending" as const }])),
    order: items.map((i) => i.id),
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

export function isScheduleApproval(item: PendingItem): boolean {
  return item.kind === "calendar" && Boolean(item.scheduleEvent);
}

export function isShoppingApproval(item: PendingItem): boolean {
  return Boolean(item.orderId);
}
