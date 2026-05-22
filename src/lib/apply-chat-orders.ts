import type { ChatAction } from "@/lib/chat-actions";
import type { PendingOrder } from "@/lib/pending-order";
import {
  clonePendingOrder,
  parseOrderFromUserMessage,
} from "@/lib/pending-order";
import { isPurchaseOrderIntent } from "@/lib/chat-intent";
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
  const created: PendingOrder[] = [];
  const seenIds = new Set<string>();
  const seenProducts = new Set<string>();

  const push = (raw: PendingOrder) => {
    if (!isValidPendingOrder(raw)) return;
    const order = prepareOrderForApprovals(clonePendingOrder(raw));
    const productKey = orderDedupeKey(order);
    if (seenIds.has(order.id) || seenProducts.has(productKey)) return;
    seenIds.add(order.id);
    seenProducts.add(productKey);
    addPendingOrderApproval(order);
    created.push(order);
  };

  for (const order of input.pendingOrders ?? []) {
    push(order);
  }

  for (const action of input.actions ?? []) {
    if (action.kind === "create_pending_order" && "order" in action && action.order) {
      push(action.order);
    }
  }

  if (created.length === 0 && isPurchaseOrderIntent(input.userMessage)) {
    const parsed = parseOrderFromUserMessage(input.userMessage);
    if (parsed) {
      push(parsed);
    }
  }

  return created;
}

