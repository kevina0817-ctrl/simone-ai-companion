import { z } from "zod";
import { inferOrderCategory, type OrderCategory } from "@/lib/order-category";

export type { OrderCategory } from "@/lib/order-category";

export type OrderLineItem = {
  name: string;
  qty: number;
  estimatedPrice: number;
};

export type PendingOrderStatus = "pending_approval" | "approved" | "declined";

export type PendingOrder = {
  id: string;
  title: string;
  store: string;
  category: OrderCategory;
  items: OrderLineItem[];
  totalEstimatedPrice: number;
  status: PendingOrderStatus;
  createdAt: string;
};

const lineItemSchema = z.object({
  name: z.string().min(1).max(120),
  qty: z.number().positive().optional(),
  estimated_price: z.number().nonnegative().optional(),
  price: z.number().nonnegative().optional(),
});

const orderToolSchema = z.object({
  title: z.string().min(1).max(120),
  store: z.string().max(80).optional(),
  items: z.array(lineItemSchema).min(1).max(40),
});

export function computeOrderTotal(items: OrderLineItem[]): number {
  return Math.round(items.reduce((sum, i) => sum + i.estimatedPrice * i.qty, 0) * 100) / 100;
}

export function normalizeOrderFromToolArgs(args: unknown): PendingOrder | null {
  const parsed = orderToolSchema.safeParse(args);
  if (!parsed.success) return null;

  const items: OrderLineItem[] = parsed.data.items.map((row) => {
    const qty = Math.max(1, Math.round(row.qty ?? 1));
    const unit = row.estimated_price ?? row.price ?? 0;
    return {
      name: row.name.trim(),
      qty,
      estimatedPrice: Math.round(unit * 100) / 100,
    };
  });

  const title = parsed.data.title.trim();
  const store = parsed.data.store?.trim() || "Whole Foods";
  return {
    id: `order-${Date.now()}`,
    title,
    store,
    category: inferOrderCategory(store, title),
    items,
    totalEstimatedPrice: computeOrderTotal(items),
    status: "pending_approval",
    createdAt: new Date().toISOString(),
  };
}

/** Fallback when the model does not call create_pending_order. */
export function parseOrderFromText(text: string): PendingOrder | null {
  const trimmed = text.trim();
  const buyIntent =
    /\b(buy|order|shop for|get|pick up|purchase|add)\b/i.test(trimmed) &&
    /\b(groceries|grocery|food|items|milk|eggs|bananas|salmon|spinach|amazon|supplies)\b/i.test(trimmed);
  if (!buyIntent) return null;

  const titleMatch = trimmed.match(
    /(?:buy|order|shop for|get)\s+(.+?)(?:\s+from\s+|\s+at\s+|$)/i,
  );
  const title = titleMatch?.[1]?.trim().slice(0, 80) || "Grocery order";

  const storeMatch = trimmed.match(/\b(?:from|at)\s+(whole foods|amazon|target|trader joe'?s?)\b/i);
  const store = storeMatch?.[1]
    ? storeMatch[1].replace(/\b\w/g, (c) => c.toUpperCase())
    : /amazon/i.test(trimmed)
      ? "Amazon"
      : "Whole Foods";

  const defaults: OrderLineItem[] = [
    { name: "Bananas (organic)", qty: 1, estimatedPrice: 2.49 },
    { name: "Baby spinach", qty: 1, estimatedPrice: 4.5 },
    { name: "Free-range eggs", qty: 1, estimatedPrice: 6.49 },
  ];

  const normalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
  return {
    id: `order-${Date.now()}`,
    title: normalizedTitle,
    store,
    category: inferOrderCategory(store, normalizedTitle),
    items: defaults,
    totalEstimatedPrice: computeOrderTotal(defaults),
    status: "pending_approval",
    createdAt: new Date().toISOString(),
  };
}

export function formatOrderDetail(order: PendingOrder): string {
  return `$${order.totalEstimatedPrice.toFixed(2)} • ${order.items.length} items • ${order.store}`;
}
