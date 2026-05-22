import type { BudgetCheck } from "@/lib/budget-store";
import {
  computeAutoAdjustedMonthlyCapCad,
  evaluateOrderBudget,
  setMonthlyBudgetCapCad,
  validateMonthlyBudgetCad,
} from "@/lib/budget-store";
import {
  completeShoppingApproval,
  declineShoppingApproval as declineShoppingApprovalInStore,
  resolveOrderIdForApproval,
  type ApprovalsDecideContext,
} from "@/lib/approvals-store";
import { getPendingOrder } from "@/lib/pending-orders-store";
import type { PendingOrder } from "@/lib/pending-order";
import type { OrderCategory } from "@/lib/order-category";

export {
  USD_TO_CAD_RATE,
  convertOtherOrderToCad,
  prepareOrderForApprovals,
  formatApprovalOrderDetail,
  categoryLabel,
  ordersTabForCategory,
} from "@/lib/order-prepare";

export type ApproveShoppingResult =
  | { status: "approved"; order: PendingOrder }
  | { status: "declined" }
  | { status: "needs_budget"; check: BudgetCheck; order: PendingOrder }
  | { status: "invalid_budget"; message: string };

function resolvePendingOrder(approvalId: string): PendingOrder | undefined {
  const orderId = resolveOrderIdForApproval(approvalId) ?? approvalId;
  return getPendingOrder(orderId);
}

export async function tryApproveShoppingOrder(
  approvalId: string,
  _ctx?: ApprovalsDecideContext,
): Promise<ApproveShoppingResult> {
  const order = resolvePendingOrder(approvalId);
  if (!order || order.status !== "pending_approval") {
    return { status: "declined" };
  }

  const check = evaluateOrderBudget(order);
  if (check.exceeds) {
    return { status: "needs_budget", check, order };
  }

  const approved = completeShoppingApproval(approvalId);
  if (!approved) return { status: "declined" };
  return { status: "approved", order: approved };
}

/** Save user-entered monthly cap (CAD), then approve if within budget. */
export async function approveShoppingOrderWithMonthlyBudgetCad(
  approvalId: string,
  monthlyCapCad: number,
  _ctx?: ApprovalsDecideContext,
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

  const approved = completeShoppingApproval(approvalId);
  if (!approved) return { status: "declined" };
  return { status: "approved", order: approved };
}

export async function declineShoppingApproval(
  approvalId: string,
  _ctx?: ApprovalsDecideContext,
): Promise<void> {
  declineShoppingApprovalInStore(approvalId);
}

export function suggestedMonthlyBudgetCad(check: BudgetCheck): number {
  return computeAutoAdjustedMonthlyCapCad(check.projected);
}
