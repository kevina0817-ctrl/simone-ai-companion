import type { BudgetCheck } from "@/lib/budget-store";
import { evaluateOrderBudget, raiseMonthlyBudgetForProjectedSpend } from "@/lib/budget-store";
import {
  decide,
  type ApprovalsDecideContext,
} from "@/lib/approvals-store";
import { getPendingOrder } from "@/lib/pending-orders-store";
import {
  computeOrderTotal,
  formatOrderDetail,
  type PendingOrder,
} from "@/lib/pending-order";
import type { OrderCategory } from "@/lib/order-category";

/** Demo FX rate — non–Grocery/Amazon tool prices are treated as USD and converted to CAD. */
export const USD_TO_CAD_RATE = 1.36;

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function stripBudgetFlags(order: PendingOrder): PendingOrder {
  const { exceedsBudget: _e, budgetOverBy: _b, ...rest } = order;
  return rest;
}

/** Convert USD-priced “other” orders to CAD before Approvals. Grocery/Amazon stay as-is. */
export function convertOtherOrderToCad(order: PendingOrder): PendingOrder {
  if (order.category !== "other") return stripBudgetFlags(order);
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

/** Queue in Approvals — no budget flags until the user taps Approve. */
export function prepareOrderForApprovals(order: PendingOrder): PendingOrder {
  const normalized =
    order.category === "grocery" || order.category === "amazon"
      ? stripBudgetFlags(order)
      : convertOtherOrderToCad(order);
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

export type ApproveShoppingResult =
  | { status: "approved" }
  | { status: "declined" }
  | { status: "needs_budget"; check: BudgetCheck; order: PendingOrder };

export async function tryApproveShoppingOrder(
  approvalId: string,
  ctx?: ApprovalsDecideContext,
): Promise<ApproveShoppingResult> {
  const order = getPendingOrder(approvalId);
  if (!order || order.status !== "pending_approval") {
    return { status: "declined" };
  }

  const check = evaluateOrderBudget(order);
  if (check.exceeds) {
    return { status: "needs_budget", check, order };
  }

  await decide(approvalId, "approved", ctx);
  return { status: "approved" };
}

export async function approveShoppingOrderAfterBudgetRaise(
  approvalId: string,
  ctx?: ApprovalsDecideContext,
): Promise<ApproveShoppingResult> {
  const order = getPendingOrder(approvalId);
  if (!order) return { status: "declined" };

  const check = evaluateOrderBudget(order);
  raiseMonthlyBudgetForProjectedSpend(check.projected);

  const recheck = evaluateOrderBudget(order);
  if (recheck.exceeds) {
    return { status: "needs_budget", check: recheck, order };
  }

  await decide(approvalId, "approved", ctx);
  return { status: "approved" };
}

export async function declineShoppingApproval(
  approvalId: string,
  ctx?: ApprovalsDecideContext,
): Promise<void> {
  await decide(approvalId, "declined", ctx);
}
