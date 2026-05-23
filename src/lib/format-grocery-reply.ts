import { inferOrderCategory } from "@/lib/order-category";
import { formatCurrency } from "@/lib/format-currency";
import type { OrderLineItem, PendingOrder } from "@/lib/pending-order";

/** One grocery line from numeric unit price — format at display time only. */
export function formatGroceryItemLine(index: number, item: OrderLineItem): string {
  const qtyLabel = item.qty > 1 ? ` — ${item.qty}×` : "";
  return `${index}. ${item.name}${qtyLabel} (${formatCurrency(item.estimatedPrice)})`;
}

export function formatGroceryListBlock(items: OrderLineItem[]): string {
  return items.map((item, i) => formatGroceryItemLine(i + 1, item)).join("\n");
}

function isGroceryListLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^\s*(?:\d+\.|[-*•])\s/.test(t)) return true;
  if (/\b(?:CA\$|US\$|CACA\$|\$)\s*[\d,]+/.test(t)) return true;
  if (/\([\s$CUA\d.,]+\)/.test(t) && /\d+\.\d{2}/.test(t)) return true;
  return false;
}

function isApprovalOrClosingParagraph(text: string): boolean {
  return /\?|(?:pending|create).{0,40}order|shall i|would you like|go ahead|approve|approvals?/i.test(
    text,
  );
}

/** Text before the first list / price line. */
export function extractLeadingIntro(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (isGroceryListLine(line)) break;
    if (line.trim()) kept.push(line);
  }
  return kept.join("\n").trim();
}

/** Last paragraph that asks for order approval (if any). */
export function extractTrailingPrompt(text: string): string {
  const paragraphs = text
    .trim()
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    if (isApprovalOrClosingParagraph(paragraphs[i]!)) return paragraphs[i]!;
  }
  const last = paragraphs[paragraphs.length - 1];
  return last && !isGroceryListLine(last) ? last : "";
}

export function groceryOrdersFromPending(orders: PendingOrder[]): PendingOrder[] {
  return orders.filter((o) => (o.category ?? inferOrderCategory(o.store, o.title)) === "grocery");
}

export function collectGroceryLineItems(orders: PendingOrder[]): OrderLineItem[] {
  return groceryOrdersFromPending(orders).flatMap((o) => o.items);
}

/** Replace LLM list copy with a list built from structured numeric prices. */
export function rebuildReplyWithGroceryItems(reply: string, items: OrderLineItem[]): string {
  if (items.length === 0) return reply.trim();

  const intro = extractLeadingIntro(reply);
  const prompt = extractTrailingPrompt(reply);
  const listBlock = formatGroceryListBlock(items);

  return [intro, listBlock, prompt].filter(Boolean).join("\n\n").trim();
}
