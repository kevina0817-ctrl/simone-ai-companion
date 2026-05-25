import type { QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { clonePendingOrder, type PendingOrder } from "@/lib/pending-order";
import { formatApprovalOrderDetail, prepareOrderForApprovals } from "@/lib/order-prepare";
import {
  dedupeScheduleEventsByTitle,
  formatScheduleTimeRange,
  normalizeScheduleEventTitle,
  type ScheduleItem,
} from "@/lib/schedule-item";
import {
  buildRoutineProposalApprovalDetail,
  type RoutineProposal,
} from "@/lib/routine-proposal";
import { buildPhase2RoutineFromProposal } from "@/lib/routine-proposal-flow";
import { clearPendingRoutineProposal } from "@/lib/routine-proposal-store";
import { toast } from "sonner";
import { recordApprovedOrderSpend } from "@/lib/budget-store";
import {
  addPendingOrder,
  commitApprovedShoppingOrder,
  getPendingOrder,
  setPendingOrderStatus,
} from "@/lib/pending-orders-store";

export type PendingItemKind = "calendar" | "grocery" | "order" | "routine_proposal";

export type PendingItem = {
  id: string;
  kind: PendingItemKind;
  title: string;
  detail: string;
  /** Shopping order payload — Approvals → Orders after approve */
  orderId?: string;
  /** Schedule event payload — Approvals → Homepage after approve (never Orders) */
  scheduleEvent?: ScheduleItem;
  /** Tired evening routine — activity names only until approved */
  routineProposal?: RoutineProposal;
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
  const parts = [
    `Schedule • ${formatScheduleTimeRange(item, item.time_zone)}`,
    item.level,
  ];
  if (item.subtitle) parts.push(item.subtitle);
  return parts.join(" • ");
}

async function commitScheduleApproval(
  id: string,
  ctx: ApprovalsDecideContext,
): Promise<{ ok: true; title: string } | { ok: false }> {
  const entry = state.items[id];
  if (!entry || entry.status !== "pending" || !entry.item.scheduleEvent) {
    return { ok: false };
  }
  try {
    const { commitScheduleToTimeline } = await import("@/lib/apply-chat-schedule");
    const committed = await commitScheduleToTimeline(
      ctx.queryClient,
      entry.item.scheduleEvent,
      ctx.userId,
    );
    return { ok: true, title: committed.title };
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Could not add event to today's schedule");
    return { ok: false };
  }
}

function markApprovalDecided(id: string, status: "approved" | "declined") {
  const entry = state.items[id];
  if (!entry || entry.status !== "pending") return;
  const decidedAt = Date.now();
  state = {
    ...state,
    items: { ...state.items, [id]: { ...entry, status, decidedAt } },
    order: state.order.includes(id) ? state.order : [id, ...state.order],
  };
}

export async function decide(
  id: string,
  status: "approved" | "declined",
  ctx?: ApprovalsDecideContext,
) {
  const entry = state.items[id];
  if (!entry || entry.status !== "pending") return;

  const activeCtx = ctx ?? decideContext;

  if (status === "approved" && entry.item.kind === "routine_proposal" && entry.item.routineProposal) {
    if (!activeCtx) {
      toast.error("Could not schedule routine — try again");
      return;
    }
    const proposal = entry.item.routineProposal;
    const { resolved } = buildPhase2RoutineFromProposal(proposal, {
      nowIso: new Date().toISOString(),
    });
    clearPendingRoutineProposal(activeCtx.userId);
    removePendingRoutineProposalApprovals(proposal.createdAt);
    if (resolved.events.length > 0) {
      addPendingScheduleApprovals(resolved.events);
      toast.success(
        resolved.events.length === 1
          ? `“${resolved.events[0]!.title}” sent for approval with scheduled times`
          : `${resolved.events.length} wind-down blocks sent for approval with scheduled times`,
      );
    } else {
      toast.error("Could not build a schedule for this routine");
    }
    markApprovalDecided(id, status);
    emit();
    return;
  }

  if (status === "approved" && entry.item.scheduleEvent) {
    if (!activeCtx) {
      toast.error("Could not update today's schedule — try again");
      return;
    }
    const result = await commitScheduleApproval(id, activeCtx);
    if (!result.ok) return;
    toast.success(`Added “${result.title}” to today's schedule`);
  }

  markApprovalDecided(id, status);

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
  addPendingScheduleApprovals([item]);
}

function routineProposalApprovalId(createdAt: string): string {
  return `routine-proposal-${createdAt}`;
}

/** Phase-1 tired routine — names only, no clock times on the card. */
export function addPendingRoutineProposal(proposal: RoutineProposal) {
  const approvalId = routineProposalApprovalId(proposal.createdAt);
  const pendingItem: PendingItem = {
    id: approvalId,
    kind: "routine_proposal",
    title: "Wind-down routine for tonight",
    detail: buildRoutineProposalApprovalDetail(proposal),
    routineProposal: proposal,
  };

  let nextItems = { ...state.items };
  let order = [...state.order];

  for (const oid of [...order]) {
    const entry = nextItems[oid];
    if (!entry || entry.status !== "pending" || entry.item.kind !== "routine_proposal") continue;
    delete nextItems[oid];
    order = order.filter((id) => id !== oid);
  }

  nextItems[approvalId] = { item: pendingItem, status: "pending" as const };
  order = [approvalId, ...order.filter((oid) => oid !== approvalId)];

  state = { items: nextItems, order };
  emit();
}

export function removePendingRoutineProposalApprovals(exceptCreatedAt?: string) {
  let nextItems = { ...state.items };
  let order = [...state.order];
  let changed = false;

  for (const oid of [...order]) {
    const entry = nextItems[oid];
    if (!entry || entry.status !== "pending" || entry.item.kind !== "routine_proposal") continue;
    if (exceptCreatedAt && entry.item.routineProposal?.createdAt === exceptCreatedAt) continue;
    delete nextItems[oid];
    order = order.filter((id) => id !== oid);
    changed = true;
  }

  if (changed) {
    state = { items: nextItems, order };
    emit();
  }
}

export function isRoutineProposalApproval(item: PendingItem): boolean {
  return item.kind === "routine_proposal" && Boolean(item.routineProposal);
}

/** Append schedule events — one pending approval per normalized title (latest wins). */
export function addPendingScheduleApprovals(items: ScheduleItem[]) {
  const deduped = dedupeScheduleEventsByTitle(items);
  if (deduped.length === 0) return;

  const newOrderIds: string[] = [];
  let nextItems = { ...state.items };
  let order = [...state.order];

  for (const item of deduped) {
    const titleKey = normalizeScheduleEventTitle(item.title);

    for (const oid of [...order]) {
      const entry = nextItems[oid];
      if (!entry || entry.status !== "pending" || !entry.item.scheduleEvent) continue;
      if (normalizeScheduleEventTitle(entry.item.scheduleEvent.title) !== titleKey) continue;
      delete nextItems[oid];
      order = order.filter((id) => id !== oid);
    }

    const approvalId = `schedule-approval-${item.id}`;
    const pendingItem: PendingItem = {
      id: approvalId,
      kind: "calendar",
      title: item.title,
      detail: formatScheduleDetail(item),
      scheduleEvent: item,
    };
    nextItems[approvalId] = { item: pendingItem, status: "pending" as const };
    newOrderIds.push(approvalId);
  }

  order = [...newOrderIds, ...order.filter((oid) => !newOrderIds.includes(oid))];

  state = {
    items: nextItems,
    order,
  };
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

export function getPendingApprovalIds(): string[] {
  return state.order.filter((id) => state.items[id]?.status === "pending");
}

export function getPendingItemsByKind(): { scheduleIds: string[]; orderIds: string[] } {
  const scheduleIds: string[] = [];
  const orderIds: string[] = [];
  for (const id of getPendingApprovalIds()) {
    const entry = state.items[id];
    if (!entry) continue;
    if (isScheduleApproval(entry.item)) scheduleIds.push(id);
    else if (isShoppingApproval(entry.item)) orderIds.push(id);
  }
  return { scheduleIds, orderIds };
}

/** Approve all pending schedule + shopping items (budget must be validated first for orders). */
export async function executeApproveAllPending(
  ctx: ApprovalsDecideContext,
): Promise<{ schedules: number; orders: number }> {
  const { scheduleIds, orderIds } = getPendingItemsByKind();
  let schedules = 0;

  for (const id of scheduleIds) {
    const result = await commitScheduleApproval(id, ctx);
    if (result.ok) {
      markApprovalDecided(id, "approved");
      schedules += 1;
    }
  }

  let orders = 0;
  for (const id of orderIds) {
    if (completeShoppingApproval(id)) orders += 1;
  }

  emit();
  return { schedules, orders };
}

/** Decline all pending items — no timeline, Orders, or budget updates. */
export function executeDeclineAllPending(): { schedules: number; orders: number } {
  const { scheduleIds, orderIds } = getPendingItemsByKind();
  let schedules = 0;

  for (const id of scheduleIds) {
    const entry = state.items[id];
    if (!entry || entry.status !== "pending") continue;
    markApprovalDecided(id, "declined");
    schedules += 1;
  }

  let orders = 0;
  for (const id of orderIds) {
    const entry = state.items[id];
    if (!entry || entry.status !== "pending") continue;
    declineShoppingApproval(id);
    orders += 1;
  }

  emit();
  return { schedules, orders };
}

export function useStatus(id: string): "pending" | "approved" | "declined" | undefined {
  const s = useApprovalsSnapshot();
  return s.items[id]?.status;
}

/** Label for Completed history, e.g. "Approved · Today, 2:45 PM". */
export function formatApprovalDecisionLabel(
  status: "approved" | "declined",
  decidedAt: number,
): string {
  const verb = status === "approved" ? "Approved" : "Declined";
  const at = new Date(decidedAt);
  const time = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const now = new Date();
  if (at.toDateString() === now.toDateString()) {
    return `${verb} · Today, ${time}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (at.toDateString() === yesterday.toDateString()) {
    return `${verb} · Yesterday, ${time}`;
  }
  return `${verb} · ${time}`;
}

function collectDecidedApprovals(s: ReturnType<typeof useApprovalsSnapshot>): DecidedItem[] {
  const seen = new Set<string>();
  const rows: DecidedItem[] = [];

  const push = (id: string) => {
    if (seen.has(id)) return;
    const entry = s.items[id];
    if (!entry || entry.status === "pending" || entry.decidedAt == null) return;
    seen.add(id);
    rows.push({
      ...entry.item,
      status: entry.status as "approved" | "declined",
      decidedAt: entry.decidedAt,
    });
  };

  for (const id of s.order) push(id);
  for (const id of Object.keys(s.items)) push(id);

  return rows.sort((a, b) => b.decidedAt - a.decidedAt);
}

export function useRecentDecisions() {
  const s = useApprovalsSnapshot();
  return collectDecidedApprovals(s);
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
      order: state.order.includes(approvalId) ? state.order : [approvalId, ...state.order],
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
  recordApprovedOrderSpend(approved);
  return approved;
}

export function declineShoppingApproval(approvalId: string): void {
  const orderId = resolveOrderIdForApproval(approvalId) ?? approvalId;
  setPendingOrderStatus(orderId, "declined");
  markShoppingApprovalDecided(approvalId, "declined", getPendingOrder(orderId));
}
