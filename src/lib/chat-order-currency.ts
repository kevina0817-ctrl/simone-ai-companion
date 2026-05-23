import { inferOrderCategory } from "@/lib/order-category";
import type { ChatAction, ChatResponse } from "@/lib/chat-actions";
import {
  collectAmountsFromOrder,
  formatCurrency,
  normalizeCurrencyInText,
  stripChatPriceBlocks,
} from "@/lib/format-currency";
import type { PendingOrder } from "@/lib/pending-order";

/** One canonical price line per order. */
export function formatChatOrderPriceSummary(order: PendingOrder): string {
  const category = order.category ?? inferOrderCategory(order.store, order.title);
  const total = formatCurrency(order.totalEstimatedPrice);

  if (category === "grocery") {
    return `Estimated grocery total: ${total}`;
  }
  return `Price estimate: ${total}`;
}

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

/** Normalize assistant reply to CA$ only and append a single price line when needed. */
export function applyChatCurrencyToReply(reply: string, orders: PendingOrder[]): string {
  if (orders.length === 0) return normalizeCurrencyInText(stripChatPriceBlocks(reply.trim()));

  let text = stripChatPriceBlocks(reply.trim());
  const allAmounts: number[] = [];

  for (const order of orders) {
    allAmounts.push(...collectAmountsFromOrder(order));
    text = normalizeCurrencyInText(text, collectAmountsFromOrder(order));
  }

  text = normalizeCurrencyInText(text, allAmounts);

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
