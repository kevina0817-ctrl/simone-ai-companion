import { z } from "zod";
import { shouldCreateOrderApproval } from "@/lib/chat-intent";
import { inferOrderCategory, type OrderCategory } from "@/lib/order-category";
import { isValidPendingOrder, isValidProductName } from "@/lib/order-validation";

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
  /** Display currency after FX normalization (other-category orders → CAD). */
  amountCurrency?: "USD" | "CAD";
  /** Pre-conversion USD total for other-category orders. */
  originalTotalUsd?: number;
  /** Set at approve time when purchase would exceed monthly budget */
  exceedsBudget?: boolean;
  budgetOverBy?: number;
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

/** Unique id per order — avoids collisions when multiple orders are created in the same millisecond. */
export function generateOrderId(): string {
  return `order-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Deep copy so approved orders are never mutated when a new pending order is added. */
export function clonePendingOrder(order: PendingOrder): PendingOrder {
  return {
    ...order,
    items: order.items.map((item) => ({ ...item })),
  };
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

  const category = inferOrderCategory(store, title);
  const order: PendingOrder = {
    id: generateOrderId(),
    title,
    store,
    category,
    items,
    totalEstimatedPrice: computeOrderTotal(items),
    status: "pending_approval",
    amountCurrency: category === "grocery" || category === "amazon" ? "CAD" : "USD",
    createdAt: new Date().toISOString(),
  };

  return isValidPendingOrder(order) ? order : null;
}

/** Fallback when the model does not call create_pending_order — user message only. */
export function parseOrderFromUserMessage(userMessage: string): PendingOrder | null {
  const trimmed = userMessage.trim();
  if (!shouldCreateOrderApproval(trimmed)) return null;

  const titleMatch = trimmed.match(
    /(?:buy|order|shop for|purchase|get)\s+(?:the\s+)?(.+?)(?:\s+from\s+|\s+at\s+|\.|,|\?|$)/i,
  );
  let title = titleMatch?.[1]?.trim().slice(0, 80) ?? "";
  if (!isValidProductName(title)) {
    if (/\btiffany\b/i.test(trimmed) && /\b(pearl|necklace|pendant)\b/i.test(trimmed)) {
      title = "Tiffany & Co. Pearl Necklace";
    } else {
      return null;
    }
  }

  const storeMatch = trimmed.match(
    /\b(?:from|at)\s+(whole foods|amazon|target|trader joe'?s?|tiffany(?:\s+&\s+co)?)\b/i,
  );
  const store = storeMatch?.[1]
    ? storeMatch[1].replace(/\b\w/g, (c) => c.toUpperCase())
    : /tiffany/i.test(trimmed)
      ? "Tiffany"
      : /amazon/i.test(trimmed)
        ? "Amazon"
        : "Online";

  const priceMatch = trimmed.match(/(?:US\$|USD|\$)\s*([\d,]+(?:\.\d{2})?)/i);
  const unitPrice = priceMatch ? Number.parseFloat(priceMatch[1].replace(/,/g, "")) : 0;

  const items: OrderLineItem[] =
    unitPrice > 0
      ? [{ name: title, qty: 1, estimatedPrice: unitPrice }]
      : [
          { name: "Bananas (organic)", qty: 1, estimatedPrice: 2.49 },
          { name: "Baby spinach", qty: 1, estimatedPrice: 4.5 },
          { name: "Free-range eggs", qty: 1, estimatedPrice: 6.49 },
        ];

  const normalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
  const category = inferOrderCategory(store, normalizedTitle);
  const order: PendingOrder = {
    id: generateOrderId(),
    title: normalizedTitle,
    store,
    category,
    items,
    totalEstimatedPrice: computeOrderTotal(items),
    status: "pending_approval",
    amountCurrency: category === "grocery" || category === "amazon" ? "CAD" : "USD",
    createdAt: new Date().toISOString(),
  };

  return isValidPendingOrder(order) ? order : null;
}

/** @deprecated Use parseOrderFromUserMessage — never parse assistant reply text. */
export function parseOrderFromText(text: string): PendingOrder | null {
  return parseOrderFromUserMessage(text);
}

export function formatOrderDetail(order: PendingOrder): string {
  const symbol =
    order.amountCurrency === "CAD" ? "CA$" : order.amountCurrency === "USD" ? "US$" : "$";
  return `${symbol}${order.totalEstimatedPrice.toFixed(2)} • ${order.items.length} items • ${order.store}`;
}
