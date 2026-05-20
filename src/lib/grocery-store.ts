import { useSyncExternalStore } from "react";

export type GroceryItem = { name: string; qty: number; price: number };

export type GroceryOrder = {
  orderId: string;
  store: string;
  eta: string;
  items: GroceryItem[];
  substitution?: string;
  note?: string;
  source: "default" | "simone";
  createdAt: string;
};

const STORAGE_KEY = "simone:grocery-order";

export const DEFAULT_GROCERY_ORDER: GroceryOrder = {
  orderId: "8803",
  store: "Whole Foods",
  eta: "Arriving tomorrow",
  source: "default",
  createdAt: "2026-05-18T00:00:00.000Z",
  items: [
    { name: "Bananas (organic)", qty: 1, price: 2.49 },
    { name: "Atlantic salmon fillet", qty: 1, price: 14.99 },
    { name: "Baby spinach", qty: 2, price: 7.0 },
    { name: "Whole milk, 1 gal", qty: 1, price: 4.29 },
    { name: "Sourdough loaf", qty: 1, price: 5.5 },
    { name: "Free-range eggs, dozen", qty: 1, price: 6.49 },
    { name: "Greek yogurt (sub)", qty: 1, price: 5.99 },
    { name: "Avocado", qty: 3, price: 4.5 },
  ],
  substitution: "Greek yogurt instead of plain yogurt",
};

export type SimoneGroceryListInput = {
  store?: string;
  items: Array<{ name: string; qty?: number; price?: number }>;
  note?: string;
  substitution?: string;
};

let simoneOrder: GroceryOrder | null = loadFromStorage();
const listeners = new Set<() => void>();

function loadFromStorage(): GroceryOrder | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GroceryOrder;
    if (parsed?.source === "simone" && Array.isArray(parsed.items) && parsed.items.length > 0) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function persist(order: GroceryOrder | null) {
  if (typeof window === "undefined") return;
  if (order) localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  else localStorage.removeItem(STORAGE_KEY);
}

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): GroceryOrder {
  return simoneOrder ?? DEFAULT_GROCERY_ORDER;
}

function getServerSnapshot(): GroceryOrder {
  return DEFAULT_GROCERY_ORDER;
}

export function useGroceryOrder(): GroceryOrder {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function hasSimoneGroceryList(): boolean {
  return simoneOrder !== null;
}

export function saveSimoneGroceryList(input: SimoneGroceryListInput): GroceryOrder {
  const items: GroceryItem[] = input.items
    .filter((i) => i.name?.trim())
    .map((i) => ({
      name: i.name.trim(),
      qty: Math.max(1, Math.round(i.qty ?? 1)),
      price: typeof i.price === "number" && i.price >= 0 ? Math.round(i.price * 100) / 100 : 0,
    }));

  if (items.length === 0) {
    throw new Error("Grocery list must include at least one item");
  }

  const order: GroceryOrder = {
    orderId: String(Date.now()).slice(-6),
    store: input.store?.trim() || "Whole Foods",
    eta: "Draft — from Simone",
    items,
    substitution: input.substitution?.trim() || undefined,
    note: input.note?.trim() || undefined,
    source: "simone",
    createdAt: new Date().toISOString(),
  };

  simoneOrder = order;
  persist(order);
  emit();
  return order;
}

export function clearSimoneGroceryList() {
  simoneOrder = null;
  persist(null);
  emit();
}
