import { inferOrderCategory } from "@/lib/order-category";
import type { ChatAction, ChatResponse } from "@/lib/chat-actions";
import {
  isGroceryOrderConfirmTurn,
  isInitialGroceryProposalTurn,
  isOrderRelatedChatContext,
} from "@/lib/chat-intent";
import {
  collectCadShoppingLineItems,
  groceryOrdersFromPending,
  rebuildReplyWithCadShoppingItems,
} from "@/lib/format-grocery-reply";
import {
  formatCurrency,
  formatFinalizedOrderPrice,
  repairCorruptedCurrency,
  sanitizeOrderConfirmationReply,
  stripChatPriceBlocks,
  stripForbiddenOrderCurrencyLines,
  stripGroceryTotalFromReply,
} from "@/lib/format-currency";
import { recomputePendingOrderTotals, type PendingOrder } from "@/lib/pending-order";

/** Grocery list proposal (first pass) vs order creation confirmation (Approvals). */
export function formatChatOrderPriceSummary(order: PendingOrder, userMessage = ""): string {
  const normalized = recomputePendingOrderTotals(order);
  const category = normalized.category ?? inferOrderCategory(normalized.store, normalized.title);

  if (category === "grocery") {
    if (isGroceryOrderCreationTurn(userMessage, [order])) {
      return formatFinalizedOrderPrice(normalized.totalEstimatedPrice);
    }
    return `Total Estimated Price: ${formatCurrency(normalized.totalEstimatedPrice)}`;
  }
  return formatFinalizedOrderPrice(normalized.totalEstimatedPrice);
}

/** Grocery order exists and user is confirming creation / approval (not first list-only turn). */
export function isGroceryOrderCreationTurn(userMessage: string, orders: PendingOrder[]): boolean {
  if (groceryOrdersFromPending(orders).length === 0) return false;
  if (isInitialGroceryProposalTurn(userMessage)) return false;
  return isGroceryOrderConfirmTurn(userMessage);
}

export function collectOrdersFromChatResult(
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

/** @deprecated Use collectOrdersFromChatResult */
export const collectUsdOrdersFromChatResult = collectOrdersFromChatResult;

function summaryAlreadyPresent(text: string, summary: string): boolean {
  const core = summary.replace(/\.$/, "").trim();
  if (text.includes(core)) return true;
  const amountMatch = core.match(/CA\$[\d,]+(?:\.\d{2})?/);
  if (amountMatch && text.includes(amountMatch[0])) {
    return /\bFinalized price\b/i.test(text) || /\bTotal Estimated Price\b/i.test(text);
  }
  return false;
}

function shouldAppendGroceryOrderTotal(userMessage: string, orders: PendingOrder[]): boolean {
  if (orders.length === 0) return false;
  const grocery = groceryOrdersFromPending(orders);
  if (grocery.length === 0) return !isInitialGroceryProposalTurn(userMessage);
  if (isGroceryOrderCreationTurn(userMessage, orders)) return true;
  const items = grocery.flatMap((o) => o.items);
  const hasStructuredGrocery = items.some((i) => i.unit != null || i.pricingMode != null);
  if (hasStructuredGrocery && isInitialGroceryProposalTurn(userMessage)) return true;
  return false;
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

    const summary = formatChatOrderPriceSummary(order, userMessage);
    if (!summaryAlreadyPresent(text, summary)) {
      summaries.push(summary);
    }
  }

  if (summaries.length === 0) return text;
  return `${text}\n\n${summaries.join("\n")}`.trim();
}

function finalizeOrderReply(
  text: string,
  orders: PendingOrder[],
  userMessage: string,
): string {
  let out = sanitizeOrderConfirmationReply(text);
  if (groceryOrdersFromPending(orders).length > 0 && shouldAppendGroceryOrderTotal(userMessage, orders)) {
    out = stripGroceryTotalFromReply(out);
  }
  out = appendOrderSummaries(out, orders, userMessage);
  return repairCorruptedCurrency(out);
}

function withRecomputedTotals(orders: PendingOrder[]): PendingOrder[] {
  return orders.map(recomputePendingOrderTotals);
}

/**
 * Order chat replies: strip LLM currency text; render prices only via formatCurrency (CAD).
 */
export function applyChatCurrencyToReply(
  reply: string,
  orders: PendingOrder[],
  opts?: { userMessage?: string },
): string {
  const userMessage = opts?.userMessage ?? "";
  const normalizedOrders = withRecomputedTotals(orders);
  const orderContext = isOrderRelatedChatContext(userMessage, normalizedOrders);

  let text = repairCorruptedCurrency(reply.trim());

  if (orderContext) {
    text = stripChatPriceBlocks(text);
    text = stripForbiddenOrderCurrencyLines(text);
  }

  const cadItems = collectCadShoppingLineItems(normalizedOrders);
  const skipListRebuild = isGroceryOrderCreationTurn(userMessage, normalizedOrders);
  if (cadItems.length > 0 && !skipListRebuild) {
    text = rebuildReplyWithCadShoppingItems(text, cadItems);
  }

  if (orderContext) {
    if (isInitialGroceryProposalTurn(userMessage) && cadItems.length === 0) {
      text = stripGroceryTotalFromReply(text);
    }
    return finalizeOrderReply(text, normalizedOrders, userMessage);
  }

  return text;
}
