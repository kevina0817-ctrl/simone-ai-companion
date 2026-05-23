import { inferOrderCategory } from "@/lib/order-category";
import type { ChatAction, ChatResponse } from "@/lib/chat-actions";
import { isGroceryOrderConfirmTurn, isInitialGroceryProposalTurn } from "@/lib/chat-intent";
import {
  collectAmountsFromOrder,
  formatCurrency,
  normalizeCurrencyInText,
  stripChatPriceBlocks,
  stripGroceryTotalFromReply,
} from "@/lib/format-currency";
import type { PendingOrder } from "@/lib/pending-order";

/** One canonical price line per order — shown after user confirms grocery order creation. */
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

function shouldAppendGroceryOrderTotal(userMessage: string, orders: PendingOrder[]): boolean {
  if (orders.length === 0) return false;
  if (isInitialGroceryProposalTurn(userMessage)) return false;
  const hasGrocery = orders.some(
    (o) => (o.category ?? inferOrderCategory(o.store, o.title)) === "grocery",
  );
  if (!hasGrocery) return true;
  return isGroceryOrderConfirmTurn(userMessage);
}

/** Normalize assistant reply to CA$ only; grocery totals only after order confirm. */
export function applyChatCurrencyToReply(
  reply: string,
  orders: PendingOrder[],
  opts?: { userMessage?: string },
): string {
  const userMessage = opts?.userMessage ?? "";
  const initialGroceryProposal = isInitialGroceryProposalTurn(userMessage);

  if (orders.length === 0 && !initialGroceryProposal) {
    return normalizeCurrencyInText(stripChatPriceBlocks(reply.trim()));
  }

  let text = stripChatPriceBlocks(reply.trim());

  if (initialGroceryProposal) {
    text = stripGroceryTotalFromReply(text);
    const amounts: number[] = [];
    for (const line of text.split("\n")) {
      const m = line.match(/CA\$\s*([\d,]+(?:\.\d{2})?)/i);
      if (m) amounts.push(Number.parseFloat(m[1].replace(/,/g, "")));
    }
    return normalizeCurrencyInText(text, amounts);
  }

  const allAmounts: number[] = [];
  for (const order of orders) {
    allAmounts.push(...collectAmountsFromOrder(order));
    text = normalizeCurrencyInText(text, collectAmountsFromOrder(order));
  }
  text = normalizeCurrencyInText(text, allAmounts);

  const showGroceryTotal = shouldAppendGroceryOrderTotal(userMessage, orders);
  const summaries: string[] = [];
  for (const order of orders) {
    const category = order.category ?? inferOrderCategory(order.store, order.title);
    if (category === "grocery" && !showGroceryTotal) continue;

    const summary = formatChatOrderPriceSummary(order);
    if (!summaryAlreadyPresent(text, summary)) {
      summaries.push(summary);
    }
  }

  if (summaries.length === 0) return text;
  return `${text}\n\n${summaries.join("\n")}`.trim();
}
