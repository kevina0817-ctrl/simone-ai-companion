import type { BudgetCheck } from "@/lib/budget-store";
import {
  computeAutoAdjustedMonthlyCapCad,
  evaluateBatchOrdersBudget,
  evaluateOrderBudget,
  saveSharedMonthlyBudgetCapCad,
  validateMonthlyBudgetCad,
} from "@/lib/budget-store";
import {
  completeShoppingApproval,
  declineShoppingApproval as declineShoppingApprovalInStore,
  executeApproveAllPending,
  getPendingApprovalIds,
  getPendingItemsByKind,
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

  saveSharedMonthlyBudgetCapCad(monthlyCapCad);

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

export type ApproveAllPendingResult =
  | { status: "approved"; schedules: number; orders: number }
  | { status: "needs_budget"; check: BudgetCheck; batchOrderTotal: number }
  | { status: "invalid_budget"; message: string }
  | { status: "nothing_pending" };

function resolvePendingShoppingOrders(approvalIds: string[]): PendingOrder[] {
  return approvalIds
    .map((id) => resolvePendingOrder(id))
    .filter((o): o is PendingOrder => Boolean(o && o.status === "pending_approval"));
}

/**
 * Approve every pending item: schedules → timeline; orders → Orders + budget tracking.
 * If batch orders exceed budget, returns needs_budget unless monthlyCapCad is provided.
 */
export async function approveAllPendingApprovals(
  ctx: ApprovalsDecideContext,
  monthlyCapCad?: number,
): Promise<ApproveAllPendingResult> {
  const pendingIds = getPendingApprovalIds();
  if (pendingIds.length === 0) return { status: "nothing_pending" };

  const { orderIds } = getPendingItemsByKind();
  const pendingOrders = resolvePendingShoppingOrders(orderIds);

  if (monthlyCapCad !== undefined) {
    const validation = validateMonthlyBudgetCad(
      monthlyCapCad,
      evaluateBatchOrdersBudget(pendingOrders).projected,
    );
    if (!validation.ok) {
      return { status: "invalid_budget", message: validation.message };
    }
    saveSharedMonthlyBudgetCapCad(monthlyCapCad);
  }

  const batchCheck = evaluateBatchOrdersBudget(pendingOrders);
  const batchOrderTotal = pendingOrders.reduce((s, o) => s + o.totalEstimatedPrice, 0);
  if (batchCheck.exceeds) {
    return { status: "needs_budget", check: batchCheck, batchOrderTotal };
  }

  const { schedules, orders } = await executeApproveAllPending(ctx);
  return { status: "approved", schedules, orders };
}
