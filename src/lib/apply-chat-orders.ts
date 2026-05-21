import type { PendingOrder } from "@/lib/pending-order";
import { normalizeOrderFromToolArgs, parseOrderFromText } from "@/lib/pending-order";
import { addPendingOrderApproval } from "@/lib/approvals-store";

export type ChatOrderAction = {
  kind: "create_pending_order";
  order: PendingOrder;
};

export function applyChatOrderResult(
  input: {
    pendingOrders?: PendingOrder[];
    actions?: Array<{ kind: string; order?: PendingOrder }>;
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
    if (action.kind === "create_pending_order" && action.order) {
      push(action.order);
    }
  }

  if (created.length === 0) {
    const parsed = parseOrderFromText(`${input.userMessage}\n${input.assistantReply ?? ""}`);
    if (parsed) {
      addPendingOrderApproval(parsed);
      created.push(parsed);
    }
  }

  return created;
}

export function orderActionFromToolArgs(args: unknown): ChatOrderAction | null {
  const order = normalizeOrderFromToolArgs(args);
  if (!order) return null;
  return { kind: "create_pending_order", order };
}
