import { z } from "zod";
import { shouldCreateOrderApproval } from "@/lib/chat-intent";
import { formatCurrency } from "@/lib/format-currency";
import {
  computeGroceryLineTotal,
  enrichGroceryLineItem,
  inferGroceryPricingMode,
  isGroceryPricedLineItem,
  type GroceryPricingMode,
} from "@/lib/grocery-pricing";
import { inferOrderCategory, type OrderCategory } from "@/lib/order-category";
import { isValidPendingOrder, isValidProductName } from "@/lib/order-validation";

export type { OrderCategory } from "@/lib/order-category";
export type { GroceryPricingMode } from "@/lib/grocery-pricing";

export type OrderLineItem = {
  name: string;
  qty: number;
  /** Unit price in CAD (same as unitPrice for grocery lines). */
  estimatedPrice: number;
  /** Grocery: numeric amount paired with unit (e.g. 3 for "3 lbs"). */
  quantity?: number;
  /** Grocery: display measure — lbs, dozen, 32 oz, bag, etc. */
  unit?: string;
  pricingMode?: GroceryPricingMode;
  /** Computed server-side from pricingMode — not from LLM. */
  lineTotal?: number;
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
  /** Set at approve time when purchase would exceed monthly budget */
  exceedsBudget?: boolean;
  budgetOverBy?: number;
};

const lineItemSchema = z.object({
  name: z.string().min(1).max(120),
  qty: z.number().positive().optional(),
  quantity: z.number().positive().optional(),
  unit: z.string().max(40).optional(),
  pricing_mode: z.enum(["per_unit", "package"]).optional(),
  estimated_price: z.number().nonnegative().optional(),
  price: z.number().nonnegative().optional(),
});

function normalizeLineItemFromTool(row: z.infer<typeof lineItemSchema>): OrderLineItem {
  const unitPrice = Math.round((row.estimated_price ?? row.price ?? 0) * 100) / 100;
  const quantity = row.quantity ?? row.qty ?? 1;
  const qty = Math.max(1, Math.round(quantity));
  const unit = row.unit?.trim() || undefined;
  const pricingMode = row.pricing_mode ?? (unit ? inferGroceryPricingMode(unit) : undefined);

  const base: OrderLineItem = {
    name: row.name.trim(),
    qty,
    quantity,
    unit,
    estimatedPrice: unitPrice,
    pricingMode,
  };

  if (unit || pricingMode) {
    return enrichGroceryLineItem(base);
  }

  return {
    ...base,
    lineTotal: Math.round(unitPrice * qty * 100) / 100,
  };
}

const orderToolSchema = z.object({
  title: z.string().min(1).max(120),
  store: z.string().max(80).optional(),
  items: z.array(lineItemSchema).min(1).max(40),
});

/** Line total — grocery uses pricingMode; other orders use count × unit price. */
export function computeLineTotal(item: OrderLineItem): number {
  if (isGroceryPricedLineItem(item) || item.pricingMode) {
    return computeGroceryLineTotal(item);
  }
  if (item.lineTotal != null && Number.isFinite(item.lineTotal)) {
    return Math.round(item.lineTotal * 100) / 100;
  }
  return Math.round(item.estimatedPrice * item.qty * 100) / 100;
}

export function computeOrderTotal(items: OrderLineItem[]): number {
  return Math.round(items.reduce((sum, i) => sum + computeLineTotal(i), 0) * 100) / 100;
}

/** Recompute line totals and order total — never trust LLM-stated totals. */
export function recomputePendingOrderTotals(order: PendingOrder): PendingOrder {
  const isGrocery = (order.category ?? inferOrderCategory(order.store, order.title)) === "grocery";
  const items = order.items.map((item) => {
    const copy = { ...item };
    if (isGrocery && (copy.unit || copy.pricingMode)) {
      return enrichGroceryLineItem(copy);
    }
    const lineTotal = Math.round(copy.estimatedPrice * copy.qty * 100) / 100;
    return { ...copy, lineTotal };
  });
  return {
    ...order,
    items,
    totalEstimatedPrice: computeOrderTotal(items),
  };
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

  const items: OrderLineItem[] = parsed.data.items.map((row) => normalizeLineItemFromTool(row));

  const title = parsed.data.title.trim();
  const store = parsed.data.store?.trim() || "Whole Foods";

  const order: PendingOrder = {
    id: generateOrderId(),
    title,
    store,
    category: inferOrderCategory(store, title),
    items,
    totalEstimatedPrice: computeOrderTotal(items),
    status: "pending_approval",
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
    /\b(?:from|at)\s+(whole foods|amazon|target|trader joe'?s?|tiffany(?:\s+&\s+co)?|louis vuitton)\b/i,
  );
  const store = storeMatch?.[1]
    ? storeMatch[1].replace(/\b\w/g, (c) => c.toUpperCase())
    : /tiffany/i.test(trimmed)
      ? "Tiffany"
      : /louis\s+vuitton/i.test(trimmed)
        ? "Louis Vuitton"
        : /amazon/i.test(trimmed)
          ? "Amazon"
          : "Online";

  const priceMatch = trimmed.match(/(?:CA\$|\$)\s*([\d,]+(?:\.\d{2})?)/i);
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
  const order: PendingOrder = {
    id: generateOrderId(),
    title: normalizedTitle,
    store,
    category: inferOrderCategory(store, normalizedTitle),
    items,
    totalEstimatedPrice: computeOrderTotal(items),
    status: "pending_approval",
    createdAt: new Date().toISOString(),
  };

  return isValidPendingOrder(order) ? order : null;
}

/** @deprecated Use parseOrderFromUserMessage — never parse assistant reply text. */
export function parseOrderFromText(text: string): PendingOrder | null {
  return parseOrderFromUserMessage(text);
}

export function formatOrderDetail(order: PendingOrder): string {
  return `${formatCurrency(order.totalEstimatedPrice)} • ${order.items.length} items • ${order.store}`;
}
