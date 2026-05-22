import { inferOrderCategory } from "@/lib/order-category";
import type { ChatAction, ChatResponse } from "@/lib/chat-actions";
import { USD_TO_CAD_RATE } from "@/lib/order-prepare";
import type { PendingOrder } from "@/lib/pending-order";

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Amount strings the model may use in prose (950, 950.00, etc.). */
function amountVariants(amount: number): string[] {
  const uniq = new Set([
    amount.toFixed(2),
    amount.toFixed(0),
    String(Math.round(amount)),
  ]);
  return [...uniq];
}

/** Replace CAD-labeled amounts that are still USD estimates from the tool. */
function fixUsdAmountLabelsInText(text: string, amount: number): string {
  let out = text;
  for (const amt of amountVariants(amount)) {
    const e = escapeRegex(amt);
    out = out.replace(new RegExp(`CA\\$\\s*${e}\\b`, "gi"), `US$${amt}`);
    out = out.replace(new RegExp(`CA\\$${e}\\b`, "gi"), `US$${amt}`);
    out = out.replace(new RegExp(`\\b${e}\\s*CAD\\b`, "gi"), `US$${amt}`);
    out = out.replace(new RegExp(`\\bCAD\\s*${e}\\b`, "gi"), `US$${amt}`);
    out = out.replace(new RegExp(`\\$\\s*${e}\\s*CAD\\b`, "gi"), `US$${amt}`);
    out = out.replace(
      new RegExp(`\\b${e}\\s*Canadian dollars?\\b`, "gi"),
      `US$${amt}`,
    );
    out = out.replace(
      new RegExp(`approximately\\s+${e}\\s*CAD\\b`, "gi"),
      `approximately US$${amt}`,
    );
  }
  return out;
}

function fixOrderUsdLabelsInReply(text: string, order: PendingOrder): string {
  let out = fixUsdAmountLabelsInText(text, order.totalEstimatedPrice);
  for (const item of order.items) {
    out = fixUsdAmountLabelsInText(out, item.estimatedPrice);
    out = fixUsdAmountLabelsInText(out, roundMoney(item.estimatedPrice * item.qty));
  }
  return out;
}

/** One-line price disclosure for chat (USD estimate; CAD only after conversion for Other). */
export function formatChatOrderPriceSummary(order: PendingOrder): string {
  const category = order.category ?? inferOrderCategory(order.store, order.title);
  const usdTotal = order.totalEstimatedPrice;
  const usdLabel = `US$${usdTotal.toFixed(2)}`;

  if (category === "grocery" || category === "amazon") {
    return `Price estimate: approximately ${usdLabel} (USD).`;
  }

  const cadTotal = roundMoney(usdTotal * USD_TO_CAD_RATE);
  return (
    `Price estimate: approximately ${usdLabel}. ` +
    `If you approve, it will be saved as about CA$${cadTotal.toFixed(2)} after conversion.`
  );
}

/** Collect tool-created orders still in USD (before Approvals conversion). */
export function collectUsdOrdersFromChatResult(result: Pick<ChatResponse, "pendingOrders" | "actions">): PendingOrder[] {
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

/**
 * Fix assistant reply currency labels and append clear USD / converted CAD wording.
 */
export function applyChatCurrencyToReply(reply: string, orders: PendingOrder[]): string {
  if (orders.length === 0) return reply;

  let text = reply.trim();
  for (const order of orders) {
    text = fixOrderUsdLabelsInReply(text, order);
  }

  const summaries = orders.map(formatChatOrderPriceSummary).join("\n");
  return `${text}\n\n${summaries}`;
}
