import { inferOrderCategory, isCadDefaultOrderCategory } from "@/lib/order-category";
import type { ChatAction, ChatResponse } from "@/lib/chat-actions";
import {
  isGroceryOrderConfirmTurn,
  isGroceryOrAmazonShoppingIntent,
  isInitialGroceryProposalTurn,
} from "@/lib/chat-intent";
import {
  collectCadShoppingLineItems,
  groceryOrdersFromPending,
  rebuildReplyWithCadShoppingItems,
} from "@/lib/format-grocery-reply";
import {
  formatCurrency,
  normalizeCurrencyInText,
  repairCorruptedCurrency,
  sanitizeCadShoppingText,
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
  if (category === "amazon") {
    return `Amazon order total: ${total}`;
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

function ordersIncludeCadDefault(orders: PendingOrder[]): boolean {
  return orders.some((o) =>
    isCadDefaultOrderCategory(o.category ?? inferOrderCategory(o.store, o.title)),
  );
}

function shouldApplyCadShoppingSanitizer(userMessage: string, orders: PendingOrder[]): boolean {
  if (ordersIncludeCadDefault(orders)) return true;
  return isGroceryOrAmazonShoppingIntent(userMessage);
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

function finalizeCadShoppingReply(
  text: string,
  orders: PendingOrder[],
  userMessage: string,
): string {
  let out = appendOrderSummaries(text, orders, userMessage);
  if (shouldApplyCadShoppingSanitizer(userMessage, orders)) {
    out = sanitizeCadShoppingText(out);
  }
  return out;
}

/**
 * Format chat reply prices from structured order numbers — never re-format CA$ strings in prose.
 * Grocery and Amazon line items render once via formatCurrency(estimatedPrice).
 */
export function applyChatCurrencyToReply(
  reply: string,
  orders: PendingOrder[],
  opts?: { userMessage?: string },
): string {
  const userMessage = opts?.userMessage ?? "";
  const initialGroceryProposal = isInitialGroceryProposalTurn(userMessage);
  const cadShopping = shouldApplyCadShoppingSanitizer(userMessage, orders);

  let text = repairCorruptedCurrency(stripChatPriceBlocks(reply.trim()));

  const cadItems = collectCadShoppingLineItems(orders);

  if (cadItems.length > 0) {
    text = rebuildReplyWithCadShoppingItems(text, cadItems);
    if (initialGroceryProposal) {
      text = stripGroceryTotalFromReply(text);
    }
    return finalizeCadShoppingReply(text, orders, userMessage);
  }

  if (initialGroceryProposal) {
    text = stripGroceryTotalFromReply(text);
    return cadShopping ? sanitizeCadShoppingText(text) : repairCorruptedCurrency(text);
  }

  if (orders.length > 0) {
    text = cadShopping ? sanitizeCadShoppingText(text) : normalizeCurrencyInText(text);
    return finalizeCadShoppingReply(text, orders, userMessage);
  }

  return cadShopping ? sanitizeCadShoppingText(text) : text;
}
