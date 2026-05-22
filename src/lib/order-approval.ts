import type { BudgetCheck } from "@/lib/budget-store";
import {
  evaluateOrderBudget,
  setMonthlyBudgetCapCad,
  validateMonthlyBudgetCad,
} from "@/lib/budget-store";
import {
  decide,
  resolveOrderIdForApproval,
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

export function ordersTabForCategory(category: OrderCategory): "Grocery" | "Amazon" | "Other" {
  if (category === "grocery") return "Grocery";
  if (category === "amazon") return "Amazon";
  return "Other";
}

function resolvePendingOrder(approvalId: string): PendingOrder | undefined {
  const orderId = resolveOrderIdForApproval(approvalId) ?? approvalId;
  return getPendingOrder(orderId);
}

export type ApproveShoppingResult =
  | { status: "approved"; order: PendingOrder }
  | { status: "declined" }
  | { status: "needs_budget"; check: BudgetCheck; order: PendingOrder }
  | { status: "invalid_budget"; message: string };

export async function tryApproveShoppingOrder(
  approvalId: string,
  ctx?: ApprovalsDecideContext,
): Promise<ApproveShoppingResult> {
  const order = resolvePendingOrder(approvalId);
  if (!order || order.status !== "pending_approval") {
    return { status: "declined" };
  }

  const check = evaluateOrderBudget(order);
  if (check.exceeds) {
    return { status: "needs_budget", check, order };
  }

  await decide(approvalId, "approved", ctx);
  const approved = resolvePendingOrder(approvalId);
  if (!approved || approved.status !== "approved") {
    return { status: "declined" };
  }
  return { status: "approved", order: approved };
}

/** Save user-entered monthly cap (CAD), then approve if within budget. */
export async function approveShoppingOrderWithMonthlyBudgetCad(
  approvalId: string,
  monthlyCapCad: number,
  ctx?: ApprovalsDecideContext,
): Promise<ApproveShoppingResult> {
  const order = resolvePendingOrder(approvalId);
  if (!order || order.status !== "pending_approval") {
    return { status: "declined" };
  }

  const check = evaluateOrderBudget(order);
  const validation = validateMonthlyBudgetCad(monthlyCapCad, check.projected);
  if (!validation.ok) {
    return { status: "invalid_budget", message: validation.message };
  }

  setMonthlyBudgetCapCad(monthlyCapCad);

  const recheck = evaluateOrderBudget(order);
  if (recheck.exceeds) {
    return { status: "needs_budget", check: recheck, order };
  }

  await decide(approvalId, "approved", ctx);
  const approved = resolvePendingOrder(approvalId);
  if (!approved || approved.status !== "approved") {
    return { status: "declined" };
  }
  return { status: "approved", order: approved };
}

export async function declineShoppingApproval(
  approvalId: string,
  ctx?: ApprovalsDecideContext,
): Promise<void> {
  await decide(approvalId, "declined", ctx);
}

export function suggestedMonthlyBudgetCad(check: BudgetCheck): number {
  if (check.monthlyCap === "unlimited") return Math.ceil(check.projected);
  return Math.max(Math.ceil(check.projected), check.monthlyCap);
}
