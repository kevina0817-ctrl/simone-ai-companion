import { useSyncExternalStore } from "react";
import type { PendingOrder, PendingOrderStatus } from "@/lib/pending-order";

const STORAGE_KEY = "simone-pending-orders";

let orders: PendingOrder[] = loadFromStorage();
const listeners = new Set<() => void>();

function loadFromStorage(): PendingOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingOrder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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

export function usePendingApprovalOrders() {
  const all = usePendingOrders();
  return all.filter((o) => o.status === "pending_approval");
}
