import { useSyncExternalStore } from "react";
import { inferOrderCategory, isShoppingOrderCategory } from "@/lib/order-category";
import { prepareOrderForApprovals } from "@/lib/order-approval";
import type { PendingOrder, PendingOrderStatus } from "@/lib/pending-order";

const STORAGE_KEY = "simone-pending-orders";
const SESSION_FLAG = "simone-orders-session";

export const ORDERS_CHANGED_EVENT = "simone-orders-changed";

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

export function notifyOrdersChanged() {
  emit();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ORDERS_CHANGED_EVENT));
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return orders;
}

function getApprovedSnapshot(): PendingOrder[] {
  return orders.filter(
    (o) => o.status === "approved" && isShoppingOrderCategory(o.category ?? inferOrderCategory(o.store, o.title)),
  );
}

export function addPendingOrder(order: PendingOrder): PendingOrder {
  const normalized =
    order.status === "pending_approval" ? prepareOrderForApprovals(order) : order;
  orders = [normalized, ...orders.filter((o) => o.id !== normalized.id)];
  persist();
  emit();
  if (typeof window !== "undefined") {
    void import("@/lib/budget-store").then((m) => m.notifyBudgetChanged());
  }
  return normalized;
}

export function getPendingOrder(id: string): PendingOrder | undefined {
  return orders.find((o) => o.id === id);
}

export function getOrdersSnapshot(): PendingOrder[] {
  return orders;
}

export function setPendingOrderStatus(id: string, status: PendingOrderStatus) {
  const idx = orders.findIndex((o) => o.id === id);
  if (idx < 0) return;
  orders = orders.map((o) => (o.id === id ? { ...o, status } : o));
  persist();
  notifyOrdersChanged();
}

/** Approve order in store — preserves category for Orders tabs (Grocery / Amazon / Other). */
export function approveOrderInStore(orderId: string): PendingOrder | undefined {
  const existing = orders.find((o) => o.id === orderId);
  if (!existing) return undefined;
  const category = existing.category ?? inferOrderCategory(existing.store, existing.title);
  orders = orders.map((o) =>
    o.id === orderId ? { ...o, category, status: "approved" as const } : o,
  );
  persist();
  notifyOrdersChanged();
  return orders.find((o) => o.id === orderId);
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
  return useSyncExternalStore(subscribe, getApprovedSnapshot, () => [] as PendingOrder[]);
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
    const withCat = o.category ? o : { ...o, category: inferOrderCategory(o.store, o.title) };
    return withCat.status === "pending_approval" ? prepareOrderForApprovals(withCat) : withCat;
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
