import { inferOrderCategory, type OrderCategory } from "@/lib/order-category";
import {
  clonePendingOrder,
  computeOrderTotal,
  formatOrderDetail,
  type PendingOrder,
} from "@/lib/pending-order";

/** Demo FX rate — non–Grocery/Amazon tool prices are treated as USD and converted to CAD. */
export const USD_TO_CAD_RATE = 1.36;

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function stripBudgetFlags(order: PendingOrder): PendingOrder {
  const { exceedsBudget: _e, budgetOverBy: _b, ...rest } = order;
  return rest;
}

/** Convert USD-priced “other” orders to CAD before Approvals (silent budget normalization). */
export function convertOtherOrderToCad(order: PendingOrder): PendingOrder {
  if (order.category !== "other") return stripBudgetFlags(order);
  if (order.amountCurrency === "CAD" && order.originalTotalUsd != null) return stripBudgetFlags(order);
  if (order.amountCurrency === "CAD") return stripBudgetFlags(order);

  const originalTotalUsd = order.totalEstimatedPrice;
  const items = order.items.map((item) => ({
    ...item,
    estimatedPrice: roundMoney(item.estimatedPrice * USD_TO_CAD_RATE),
  }));

  return {
    ...stripBudgetFlags(order),
    items,
    totalEstimatedPrice: computeOrderTotal(items),
    amountCurrency: "CAD",
    originalTotalUsd,
  };
}

/** Grocery / Amazon tool estimates are Canadian list prices — store as CAD for budget. */
export function normalizeGroceryAmazonOrderCurrency(order: PendingOrder): PendingOrder {
  if (order.category !== "grocery" && order.category !== "amazon") return order;
  return {
    ...stripBudgetFlags(order),
    amountCurrency: "CAD",
    originalTotalUsd: undefined,
  };
}

/** Queue in Approvals — no budget flags until the user taps Approve. */
export function prepareOrderForApprovals(order: PendingOrder): PendingOrder {
  const base = clonePendingOrder(order);
  const withCategory = base.category
    ? base
    : { ...base, category: inferOrderCategory(base.store, base.title) };
  const normalized =
    withCategory.category === "grocery" || withCategory.category === "amazon"
      ? normalizeGroceryAmazonOrderCurrency(withCategory)
      : convertOtherOrderToCad(withCategory);
  return {
    ...normalized,
    status: "pending_approval",
    exceedsBudget: undefined,
    budgetOverBy: undefined,
  };
}

export function formatApprovalOrderDetail(order: PendingOrder): string {
  const base = formatOrderDetail(order);
  if (order.amountCurrency === "CAD" && order.originalTotalUsd != null) {
    return `${base} · converted from US$${order.originalTotalUsd.toFixed(2)}`;
  }
  return base;
}

export function categoryLabel(category: OrderCategory): string {
  if (category === "amazon") return "Amazon";
  if (category === "grocery") return "Grocery";
  return "Other";
}

export function ordersTabForCategory(category: OrderCategory): "Grocery" | "Amazon" | "Other" {
  if (category === "grocery") return "Grocery";
  if (category === "amazon") return "Amazon";
  return "Other";
}
