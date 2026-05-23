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
  repairCorruptedCurrency,
  stripChatPriceBlocks,
  stripForbiddenOrderCurrencyLines,
  stripGroceryTotalFromReply,
} from "@/lib/format-currency";
import { recomputePendingOrderTotals, type PendingOrder } from "@/lib/pending-order";

/** Canonical order price line — always CA$ from numeric totals (never LLM copy). */
export function formatChatOrderPriceSummary(order: PendingOrder): string {
  const normalized = recomputePendingOrderTotals(order);
  const category = normalized.category ?? inferOrderCategory(normalized.store, normalized.title);
  const total = formatCurrency(normalized.totalEstimatedPrice);

  if (category === "grocery") {
    return `Total Estimated Price: ${total}`;
  }
  if (category === "amazon") {
    return `Amazon order total: ${total}`;
  }
  return `Price estimate: approximately ${total}`;
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
  return text.includes(core);
}

function shouldAppendGroceryOrderTotal(userMessage: string, orders: PendingOrder[]): boolean {
  if (orders.length === 0) return false;
  const grocery = groceryOrdersFromPending(orders);
  if (grocery.length === 0) return !isInitialGroceryProposalTurn(userMessage);
  const items = grocery.flatMap((o) => o.items);
  const hasStructuredGrocery = items.some((i) => i.unit != null || i.pricingMode != null);
  if (hasStructuredGrocery) return true;
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

function finalizeOrderReply(
  text: string,
  orders: PendingOrder[],
  userMessage: string,
): string {
  let out = stripForbiddenOrderCurrencyLines(text);
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
 * No US$/USD replacement — structured order data is the single source of truth.
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
  if (cadItems.length > 0) {
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
