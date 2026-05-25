import { inferOrderCategory, type OrderCategory } from "@/lib/order-category";
import {
  clonePendingOrder,
  formatOrderDetail,
  type PendingOrder,
} from "@/lib/pending-order";

function stripBudgetFlags(order: PendingOrder): PendingOrder {
  const { exceedsBudget: _e, budgetOverBy: _b, ...rest } = order;
  return rest;
}

/** Queue in Approvals — all amounts are treated as CAD for display and budget. */
export function prepareOrderForApprovals(order: PendingOrder): PendingOrder {
  const base = clonePendingOrder(order);
  const withCategory = base.category
    ? base
    : { ...base, category: inferOrderCategory(base.store, base.title) };
  return {
    ...stripBudgetFlags(withCategory),
    status: "pending_approval",
    exceedsBudget: undefined,
    budgetOverBy: undefined,
  };
}

export function formatApprovalOrderDetail(order: PendingOrder): string {
  return formatOrderDetail(order);
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
