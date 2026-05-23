import { inferOrderCategory } from "@/lib/order-category";
import type { OrderLineItem, PendingOrder } from "@/lib/pending-order";

/** Assistant / filler phrases that must never become order titles or line items. */
const CONVERSATIONAL_PHRASE =
  /\b(?:let me know|further assistance|anything else|happy to help|if you(?:'d| would)? like|need further|for this item|for this necklace or|or need further|sent to (?:your )?approvals?|pending approval|create_pending_order|i(?:'ve| have) (?:sent|added|created)|feel free to|don't hesitate)\b/i;

const WEAK_TITLE_START =
  /^(?:for|or|if|let|this|that|the|a|an|you|your|it|its|any|some|need|get|here)\b/i;

const GENERIC_ONLY_TITLE =
  /^(?:shopping order|grocery order|online order|new order|this item|that item|the item|necklace|pendant|item|product)$/i;

function hasSubstantiveProductWords(text: string): boolean {
  const stop = new Set([
    "for",
    "this",
    "that",
    "the",
    "a",
    "an",
    "or",
    "and",
    "if",
    "you",
    "your",
    "need",
    "further",
    "assistance",
    "item",
    "any",
    "some",
    "else",
    "know",
    "let",
    "me",
    "help",
    "about",
    "from",
    "with",
  ]);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s&'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
  const substantive = tokens.filter((w) => !stop.has(w));
  return substantive.length >= 1 && substantive.join(" ").length >= 4;
}

export function isValidProductName(name: string): boolean {
  const t = name.trim().replace(/\s+/g, " ");
  if (t.length < 4 || t.length > 120) return false;
  if (CONVERSATIONAL_PHRASE.test(t)) return false;
  if (WEAK_TITLE_START.test(t) && !/\b(?:tiffany|amazon|whole foods|pearl|necklace|bag|shoes)\b/i.test(t)) {
    return false;
  }
  if (GENERIC_ONLY_TITLE.test(t)) return false;
  if (!/[a-zA-Z]/.test(t)) return false;
  return hasSubstantiveProductWords(t);
}

function isValidLineItem(item: OrderLineItem): boolean {
  if (!isValidProductName(item.name)) return false;
  if (!Number.isFinite(item.qty) || item.qty < 1) return false;
  if (!Number.isFinite(item.estimatedPrice) || item.estimatedPrice <= 0) return false;
  return true;
}

export function isValidPendingOrder(order: PendingOrder): boolean {
  if (!order.title?.trim() || !order.store?.trim()) return false;
  if (!isValidProductName(order.title)) return false;
  if (!Array.isArray(order.items) || order.items.length === 0) return false;
  if (!order.items.every(isValidLineItem)) return false;
  if (!Number.isFinite(order.totalEstimatedPrice) || order.totalEstimatedPrice <= 0) return false;

  const sum = order.items.reduce((s, i) => s + i.estimatedPrice * Math.max(1, i.qty), 0);
  if (Math.abs(sum - order.totalEstimatedPrice) > 0.05 * Math.max(order.totalEstimatedPrice, 1)) {
    return false;
  }

  inferOrderCategory(order.store, order.title);
  return true;
}

/** Stable key to collapse duplicate approvals for the same product. */
export function orderDedupeKey(order: PendingOrder): string {
  const itemNames = order.items.map((i) => i.name.toLowerCase()).join("|");
  return `${order.title.toLowerCase()}|${order.store.toLowerCase()}|${itemNames}`;
}
