import { useSyncExternalStore } from "react";
import { inferOrderCategory, isShoppingOrderCategory } from "@/lib/order-category";
import { prepareOrderForApprovals } from "@/lib/order-prepare";
import {
  clonePendingOrder,
  generateOrderId,
  type PendingOrder,
  type PendingOrderStatus,
} from "@/lib/pending-order";

const STORAGE_KEY = "simone-pending-orders";
const SESSION_FLAG = "simone-orders-session";

const listeners = new Set<() => void>();

function loadFromStorage(): PendingOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingOrder[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((o) =>
      o.category ? o : { ...o, category: inferOrderCategory(o.store, o.title) },
    );
  } catch {
    return [];
  }
}

function loadOrdersForSession(): PendingOrder[] {
  if (typeof window === "undefined") return [];
  if (!sessionStorage.getItem(SESSION_FLAG)) {
    sessionStorage.setItem(SESSION_FLAG, "1");
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
  return loadFromStorage();
}

let orders: PendingOrder[] = loadOrdersForSession();

function persist() {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return orders;
}

export function addPendingOrder(order: PendingOrder): PendingOrder {
  let normalized =
    order.status === "pending_approval"
      ? prepareOrderForApprovals(clonePendingOrder(order))
      : clonePendingOrder(order);

  const existing = orders.find((o) => o.id === normalized.id);
  if (existing && existing.status !== "pending_approval") {
    normalized = { ...normalized, id: generateOrderId() };
    if (normalized.status === "pending_approval") {
      normalized = prepareOrderForApprovals(normalized);
    }
  }

  normalized = clonePendingOrder(normalized);
  orders = [normalized, ...orders.filter((o) => o.id !== normalized.id)];
  persist();
  emit();
  if (typeof window !== "undefined") {
    void import("@/lib/budget-store").then((m) => m.notifyBudgetChanged());
  }
  return normalized;
}

export function getPendingOrder(id: string): PendingOrder | undefined {
  const found = orders.find((o) => o.id === id);
  return found ? clonePendingOrder(found) : undefined;
}

/** Approvals UI — only the current pending order payload (never approved/declined). */
export function getPendingApprovalOrder(id: string): PendingOrder | undefined {
  const found = orders.find((o) => o.id === id && o.status === "pending_approval");
  return found ? clonePendingOrder(found) : undefined;
}

export function getOrdersSnapshot(): PendingOrder[] {
  return orders;
}

export function setPendingOrderStatus(id: string, status: PendingOrderStatus) {
  const idx = orders.findIndex((o) => o.id === id);
  if (idx < 0) return;
  orders = orders.map((o) => (o.id === id ? { ...o, status } : o));
  persist();
  emit();
  if (typeof window !== "undefined") {
    void import("@/lib/budget-store").then((m) => m.notifyBudgetChanged());
  }
}

/** Move pending order into approved Orders store (Grocery / Amazon / Other tabs). */
export function commitApprovedShoppingOrder(orderId: string): PendingOrder | undefined {
  const existing = orders.find((o) => o.id === orderId);
  if (!existing || existing.status !== "pending_approval") return undefined;

  const category = existing.category ?? inferOrderCategory(existing.store, existing.title);
  const approved: PendingOrder = {
    ...clonePendingOrder(existing),
    category,
    status: "approved",
    exceedsBudget: undefined,
    budgetOverBy: undefined,
  };

  orders = orders.map((o) => (o.id === orderId ? approved : o));
  persist();
  emit();
  if (typeof window !== "undefined") {
    void import("@/lib/budget-store").then((m) => m.notifyBudgetChanged());
  }
  return approved;
}

export function usePendingOrders() {
  return useSyncExternalStore(subscribe, getSnapshot, () => [] as PendingOrder[]);
}

/** Orders awaiting user sign-off — Approvals page only. */
export function usePendingApprovalOrders() {
  const all = usePendingOrders();
  return all.filter((o) => o.status === "pending_approval");
}

/** Approved grocery / Amazon / online orders — Orders page only (never calendar events). */
export function useApprovedOrders() {
  const all = usePendingOrders();
  return all.filter((o) => {
    if (o.status !== "approved") return false;
    const category = o.category ?? inferOrderCategory(o.store, o.title);
    return isShoppingOrderCategory(category);
  });
}

export function clearAllOrders() {
  orders = [];
  persist();
  emit();
}

/** Replace in-memory orders (e.g. Jordan Ross sample data). */
export function replacePendingOrders(next: PendingOrder[]) {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(SESSION_FLAG, "1");
  }
  orders = next.map((o) => {
    const cloned = clonePendingOrder(o);
    const withCat = cloned.category
      ? cloned
      : { ...cloned, category: inferOrderCategory(cloned.store, cloned.title) };
    return withCat.status === "pending_approval"
      ? prepareOrderForApprovals(withCat)
      : clonePendingOrder(withCat);
  });
  persist();
  emit();
  if (typeof window !== "undefined") {
    void import("@/lib/budget-store").then((m) => m.notifyBudgetChanged());
  }
}

/** Re-run session reset (e.g. after tests). Budget localStorage is not touched. */
export function initOrdersForSession() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_FLAG);
  orders = loadOrdersForSession();
  emit();
}
