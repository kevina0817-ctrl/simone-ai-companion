import { inferOrderCategory } from "@/lib/order-category";
import type { ChatAction, ChatResponse } from "@/lib/chat-actions";
import { isGroceryOrderConfirmTurn, isInitialGroceryProposalTurn } from "@/lib/chat-intent";
import {
  collectGroceryLineItems,
  groceryOrdersFromPending,
  rebuildReplyWithGroceryItems,
} from "@/lib/format-grocery-reply";
import {
  formatCurrency,
  normalizeCurrencyInText,
  repairCorruptedCurrency,
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
  const hasGrocery = groceryOrdersFromPending(orders).length > 0;
  if (!hasGrocery) return true;
  return isGroceryOrderConfirmTurn(userMessage);
}

function appendOrderSummaries(
  text: string,
  orders: PendingOrder[],
  userMessage: string,
): string {
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

/**
 * Format chat reply prices from structured order numbers — never re-format CA$ strings in prose.
 * Grocery line items are rendered once via formatCurrency(estimatedPrice).
 */
export function applyChatCurrencyToReply(
  reply: string,
  orders: PendingOrder[],
  opts?: { userMessage?: string },
): string {
  const userMessage = opts?.userMessage ?? "";
  const initialGroceryProposal = isInitialGroceryProposalTurn(userMessage);

  let text = repairCorruptedCurrency(stripChatPriceBlocks(reply.trim()));

  const groceryItems = collectGroceryLineItems(orders);

  if (groceryItems.length > 0) {
    text = rebuildReplyWithGroceryItems(text, groceryItems);
    if (initialGroceryProposal) {
      text = stripGroceryTotalFromReply(text);
    }
    return appendOrderSummaries(text, orders, userMessage);
  }

  if (initialGroceryProposal) {
    text = stripGroceryTotalFromReply(text);
    return repairCorruptedCurrency(text);
  }

  if (orders.length > 0) {
    text = normalizeCurrencyInText(text);
    return appendOrderSummaries(text, orders, userMessage);
  }

  return normalizeCurrencyInText(text);
}
