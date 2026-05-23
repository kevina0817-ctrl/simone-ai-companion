import { inferOrderCategory } from "@/lib/order-category";
import type { ChatAction, ChatResponse } from "@/lib/chat-actions";
import {
  formatCurrencyByCategory,
  stripChatPriceBlocks,
  normalizeCurrencyInReplyForOrder,
  type OriginalCurrency,
} from "@/lib/format-currency-by-category";
import type { PendingOrder } from "@/lib/pending-order";

function orderOriginalCurrency(order: PendingOrder): OriginalCurrency {
  if (order.amountCurrency === "CAD") return "CAD";
  return "USD";
}

/** One canonical price line per order — no CAD+USD mix, no conversion copy. */
export function formatChatOrderPriceSummary(order: PendingOrder): string {
  const category = order.category ?? inferOrderCategory(order.store, order.title);
  const original = orderOriginalCurrency(order);
  const total = order.totalEstimatedPrice;
  const label = formatCurrencyByCategory(category, total, original);

  if (category === "grocery") {
    return `Estimated grocery total: ${label}`;
  }
  if (category === "amazon") {
    return `Price estimate: ${label}`;
  }
  return `Price estimate: approximately ${label}.`;
}

/** Collect tool-created orders for currency normalization. */
export function collectUsdOrdersFromChatResult(
  result: Pick<ChatResponse, "pendingOrders" | "actions">,
): PendingOrder[] {
  const seen = new Set<string>();
  const orders: PendingOrder[] = [];

  const push = (o: PendingOrder) => {
    if (seen.has(o.id)) return;
    seen.add(o.id);
    orders.push(o);
  };

  for (const o of result.pendingOrders ?? []) {
    push(o);
  }
  for (const action of result.actions ?? []) {
    if (action.kind === "create_pending_order" && "order" in action && action.order) {
      push(action.order);
    }
  }
  return orders;
}

function summaryAlreadyPresent(text: string, summary: string): boolean {
  const core = summary.replace(/\.$/, "").trim();
  return text.includes(core);
}

/**
 * Apply strict category currency rules to assistant chat copy.
 * Budget CAD conversion stays in order-prepare / approvals — not shown here.
 */
export function applyChatCurrencyToReply(reply: string, orders: PendingOrder[]): string {
  if (orders.length === 0) return reply;

  let text = stripChatPriceBlocks(reply.trim());

  for (const order of orders) {
    const category = order.category ?? inferOrderCategory(order.store, order.title);
    const original = orderOriginalCurrency(order);
    text = normalizeCurrencyInReplyForOrder(text, category, order, original);
  }

  const summaries: string[] = [];
  for (const order of orders) {
    const summary = formatChatOrderPriceSummary(order);
    if (!summaryAlreadyPresent(text, summary)) {
      summaries.push(summary);
    }
  }

  if (summaries.length === 0) return text;
  return `${text}\n\n${summaries.join("\n")}`.trim();
}
