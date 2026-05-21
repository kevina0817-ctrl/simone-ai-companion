import { useSyncExternalStore } from "react";
import { inferOrderCategory, isShoppingOrderCategory } from "@/lib/order-category";
import type { PendingOrder, PendingOrderStatus } from "@/lib/pending-order";

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
  orders = [order, ...orders.filter((o) => o.id !== order.id)];
  persist();
  emit();
  return order;
}

export function getPendingOrder(id: string): PendingOrder | undefined {
  return orders.find((o) => o.id === id);
}

export function setPendingOrderStatus(id: string, status: PendingOrderStatus) {
  const idx = orders.findIndex((o) => o.id === id);
  if (idx < 0) return;
  orders = orders.map((o) => (o.id === id ? { ...o, status } : o));
  persist();
  emit();
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
  return all.filter(
    (o) => o.status === "approved" && isShoppingOrderCategory(o.category),
  );
}

export function clearAllOrders() {
  orders = [];
  persist();
  emit();
}

/** Re-run session reset (e.g. after tests). Budget localStorage is not touched. */
export function initOrdersForSession() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_FLAG);
  orders = loadOrdersForSession();
  emit();
}
