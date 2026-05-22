import type { ChatAction } from "@/lib/chat-actions";
import type { PendingOrder } from "@/lib/pending-order";
import {
  clonePendingOrder,
  normalizeOrderFromToolArgs,
  parseOrderFromText,
} from "@/lib/pending-order";
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
  const seen = new Set<string>();

  const push = (raw: PendingOrder) => {
    const order = prepareOrderForApprovals(clonePendingOrder(raw));
    if (seen.has(order.id)) return;
    seen.add(order.id);
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

  if (created.length === 0) {
    const combined = `${input.userMessage}\n${input.assistantReply ?? ""}`;
    const parsed = parseOrderFromText(combined);
    const scheduleIntent =
      /\b(schedule|book|add|cancel|remove|delete|meeting|appointment|event|session)\b/i.test(
        combined,
      );
    if (parsed && !scheduleIntent) {
      const order = prepareOrderForApprovals(parsed);
      addPendingOrderApproval(order);
      created.push(order);
    }
  }

  return created;
}

