import type { ChatAction } from "@/lib/chat-actions";
import type { PendingOrder } from "@/lib/pending-order";
import { normalizeOrderFromToolArgs, parseOrderFromText } from "@/lib/pending-order";
import { addPendingOrderApproval } from "@/lib/approvals-store";

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

  const push = (order: PendingOrder) => {
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
      addPendingOrderApproval(parsed);
      created.push(parsed);
    }
  }

  return created;
}

