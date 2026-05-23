import type { ChatAction } from "@/lib/chat-actions";
import type { PendingOrder } from "@/lib/pending-order";
import {
  clonePendingOrder,
  parseOrderFromUserMessage,
  recomputePendingOrderTotals,
} from "@/lib/pending-order";
import {
  pickSingleOrderForApproval,
  shouldCreateOrderApproval,
} from "@/lib/chat-intent";
import { isValidPendingOrder, orderDedupeKey } from "@/lib/order-validation";
import { addPendingOrderApproval } from "@/lib/approvals-store";
import { prepareOrderForApprovals } from "@/lib/order-approval";

export function applyChatOrderResult(
  input: {
    pendingOrders?: PendingOrder[];
    actions?: ChatAction[];
    userMessage: string;
    assistantReply?: string;
  },
): PendingOrder[] {
  if (!shouldCreateOrderApproval(input.userMessage)) {
    return [];
  }

  const created: PendingOrder[] = [];
  const seenIds = new Set<string>();
  const seenProducts = new Set<string>();

  const push = (raw: PendingOrder) => {
    const recomputed = recomputePendingOrderTotals(raw);
    if (!isValidPendingOrder(recomputed)) return;
    const order = prepareOrderForApprovals(clonePendingOrder(recomputed));
    const productKey = orderDedupeKey(order);
    if (seenIds.has(order.id) || seenProducts.has(productKey)) return;
    seenIds.add(order.id);
    seenProducts.add(productKey);
    addPendingOrderApproval(order);
    created.push(order);
  };

  const rawToolOrders: PendingOrder[] = [
    ...(input.pendingOrders ?? []),
    ...(input.actions ?? [])
      .filter(
        (a): a is Extract<ChatAction, { kind: "create_pending_order"; order: PendingOrder }> =>
          a.kind === "create_pending_order" && "order" in a && Boolean(a.order),
      )
      .map((a) => a.order),
  ];
  const uniqueToolOrders: PendingOrder[] = [];
  const seenToolKeys = new Set<string>();
  for (const o of rawToolOrders) {
    const key = orderDedupeKey(o);
    if (seenToolKeys.has(key)) continue;
    seenToolKeys.add(key);
    uniqueToolOrders.push(o);
  }
  const toolOrders = pickSingleOrderForApproval(input.userMessage, uniqueToolOrders);

  for (const order of toolOrders) {
    push(order);
  }

  if (created.length === 0) {
    const parsed = parseOrderFromUserMessage(input.userMessage);
    if (parsed) {
      push(parsed);
    }
  }

  return created;
}

