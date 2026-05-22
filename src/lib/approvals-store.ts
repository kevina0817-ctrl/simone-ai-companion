import type { QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { clonePendingOrder, type PendingOrder } from "@/lib/pending-order";
import { formatApprovalOrderDetail, prepareOrderForApprovals } from "@/lib/order-prepare";
import { formatScheduleTimeRange, type ScheduleItem } from "@/lib/schedule-item";
import { toast } from "sonner";
import { recordApprovedOrderSpend } from "@/lib/budget-store";
import {
  addPendingOrder,
  commitApprovedShoppingOrder,
  getPendingOrder,
  setPendingOrderStatus,
} from "@/lib/pending-orders-store";

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

const emptyApprovalsState = (): {
  items: Record<
    string,
    { item: PendingItem; status: "pending" | "approved" | "declined"; decidedAt?: number }
  >;
  order: string[];
} => ({
  items: {},
  order: [],
});

let state = emptyApprovalsState();

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
  const parts = [`Schedule • ${formatScheduleTimeRange(item)}`, item.level];
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

  const orderId = entry.item.orderId ?? (isShoppingApproval(entry.item) ? id : undefined);
  if (orderId) {
    setPendingOrderStatus(orderId, status === "approved" ? "approved" : "declined");
    if (status === "approved") {
      const order = getPendingOrder(orderId);
      if (order) recordApprovedOrderSpend(order);
    }
  }

  emit();
}

/** Shopping order → Approvals only until approved; budget checked on Approve. */
export function addPendingOrderApproval(order: PendingOrder) {
  const stored = addPendingOrder(prepareOrderForApprovals(clonePendingOrder(order)));
  const approvalId = shoppingApprovalId(stored.id);
  const item: PendingItem = {
    id: approvalId,
    kind: "order",
    title: stored.title,
    detail: formatApprovalOrderDetail(stored),
    orderId: stored.id,
  };

  const existing = state.items[approvalId];
  if (existing?.status === "pending") {
    state = {
      ...state,
      items: { ...state.items, [approvalId]: { item, status: "pending" as const } },
    };
  } else {
    state = {
      items: { ...state.items, [approvalId]: { item, status: "pending" as const } },
      order: [approvalId, ...state.order.filter((oid) => oid !== approvalId)],
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

/** Reset approvals queue (e.g. persona switch). Pass [] for an empty queue on profile load. */
export function resetApprovalsPending(items: PendingItem[] = []) {
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

export function useStatus(id: string): "pending" | "approved" | "declined" | undefined {
  const s = useApprovalsSnapshot();
  return s.items[id]?.status;
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

function shoppingApprovalId(orderId: string): string {
  return `approval-${orderId}`;
}

function removeFromPendingApprovalQueue(approvalId: string) {
  state = {
    ...state,
    order: state.order.filter((oid) => oid !== approvalId),
  };
}

export function resolveOrderIdForApproval(approvalId: string): string | undefined {
  const entry = state.items[approvalId];
  return entry?.item.orderId ?? approvalId;
}

function markShoppingApprovalDecided(
  approvalId: string,
  status: "approved" | "declined",
  order?: PendingOrder,
) {
  const decidedAt = Date.now();
  const entry = state.items[approvalId];
  if (entry && entry.status === "pending") {
    state = {
      ...state,
      items: { ...state.items, [approvalId]: { ...entry, status, decidedAt } },
    };
  } else if (order) {
    const item: PendingItem = {
      id: approvalId,
      kind: "order",
      title: order.title,
      detail: formatApprovalOrderDetail(order),
      orderId: order.id,
    };
    state = {
      items: { ...state.items, [approvalId]: { item, status, decidedAt } },
      order: state.order.includes(approvalId) ? state.order : [approvalId, ...state.order],
    };
  }
  emit();
}

/**
 * Approve shopping order: write to Orders store first, then remove from Approvals pending.
 */
export function completeShoppingApproval(approvalId: string): PendingOrder | null {
  const orderId = resolveOrderIdForApproval(approvalId) ?? approvalId;
  const approved = commitApprovedShoppingOrder(orderId);
  if (!approved) return null;

  markShoppingApprovalDecided(approvalId, "approved", approved);
  removeFromPendingApprovalQueue(approvalId);
  recordApprovedOrderSpend(approved);
  return approved;
}

export function declineShoppingApproval(approvalId: string): void {
  const orderId = resolveOrderIdForApproval(approvalId) ?? approvalId;
  setPendingOrderStatus(orderId, "declined");
  markShoppingApprovalDecided(approvalId, "declined", getPendingOrder(orderId));
  removeFromPendingApprovalQueue(approvalId);
}
