import { inferOrderCategory, isCadDefaultOrderCategory } from "@/lib/order-category";
import { formatCurrency } from "@/lib/format-currency";
import { formatGroceryQuantityLabel, isGroceryPricedLineItem } from "@/lib/grocery-pricing";
import { computeLineTotal, type OrderLineItem, type PendingOrder } from "@/lib/pending-order";

/** Compact line for Amazon / count-based orders. */
export function formatShoppingItemLine(index: number, item: OrderLineItem): string {
  const unit = item.estimatedPrice;
  const lineTotal = computeLineTotal(item);
  if (item.qty > 1) {
    return `${index}. ${item.name} — ${item.qty} × ${formatCurrency(unit)} = ${formatCurrency(lineTotal)}`;
  }
  return `${index}. ${item.name} (${formatCurrency(unit)})`;
}

/** Grocery line with quantity, unit price, and line total (CAD only). */
export function formatGroceryItemBlock(index: number, item: OrderLineItem): string {
  const lineTotal = computeLineTotal(item);
  const unitPrice = item.estimatedPrice;
  const qtyLabel = formatGroceryQuantityLabel(item);
  const mode = item.pricingMode;

  let lineTotalLine: string;
  if (mode === "package") {
    lineTotalLine = `* Line Total: ${formatCurrency(lineTotal)}`;
  } else {
    const n = item.quantity ?? item.qty;
    if (n > 1) {
      lineTotalLine = `* Line Total: ${n} × ${formatCurrency(unitPrice)} = ${formatCurrency(lineTotal)}`;
    } else {
      lineTotalLine = `* Line Total: ${formatCurrency(lineTotal)}`;
    }
  }

  return [
    `${index}. ${item.name}`,
    `* Quantity: ${qtyLabel}`,
    `* Estimated Price: ${formatCurrency(unitPrice)}`,
    lineTotalLine,
  ].join("\n");
}

export function formatGroceryItemLine(index: number, item: OrderLineItem): string {
  if (isGroceryPricedLineItem(item)) {
    return formatGroceryItemBlock(index, item);
  }
  return formatShoppingItemLine(index, item);
}

export function formatGroceryListBlock(items: OrderLineItem[]): string {
  return formatShoppingListBlock(items);
}

export function formatShoppingListBlock(items: OrderLineItem[]): string {
  return items.map((item, i) => formatGroceryItemLine(i + 1, item)).join("\n\n");
}

function isGroceryListLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^\s*(?:\d+\.|[-*•])\s/.test(t)) return true;
  if (/^\s*\*\s*(?:Quantity|Estimated Price|Line Total)/i.test(t)) return true;
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

export function cadDefaultOrdersFromPending(orders: PendingOrder[]): PendingOrder[] {
  return orders.filter((o) =>
    isCadDefaultOrderCategory(o.category ?? inferOrderCategory(o.store, o.title)),
  );
}

export function groceryOrdersFromPending(orders: PendingOrder[]): PendingOrder[] {
  return orders.filter((o) => (o.category ?? inferOrderCategory(o.store, o.title)) === "grocery");
}

export function collectGroceryLineItems(orders: PendingOrder[]): OrderLineItem[] {
  return groceryOrdersFromPending(orders).flatMap((o) => o.items);
}

export function collectCadShoppingLineItems(orders: PendingOrder[]): OrderLineItem[] {
  return cadDefaultOrdersFromPending(orders).flatMap((o) => o.items);
}

/** Replace LLM list copy with a list built from structured numeric prices. */
export function rebuildReplyWithGroceryItems(reply: string, items: OrderLineItem[]): string {
  return rebuildReplyWithCadShoppingItems(reply, items);
}

export function rebuildReplyWithCadShoppingItems(reply: string, items: OrderLineItem[]): string {
  if (items.length === 0) return reply.trim();

  const intro = extractLeadingIntro(reply);
  const prompt = extractTrailingPrompt(reply);
  const listBlock = formatShoppingListBlock(items);

  return [intro, listBlock, prompt].filter(Boolean).join("\n\n").trim();
}
