import type { OrderCategory } from "@/lib/order-category";
import { USD_TO_CAD_RATE } from "@/lib/order-prepare";

export type OriginalCurrency = "USD" | "CAD";

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pretty print with thousands separators (e.g. 2700 → 2,700.00). */
export function formatMoneyAmount(amount: number): string {
  return amount.toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Category rules for user-facing chat copy.
 * - grocery / amazon → CA$ only (same numeric tool estimate, localized label)
 * - other (luxury) → US$ only
 */
export function formatCurrencyByCategory(
  category: OrderCategory,
  amount: number,
  originalCurrency: OriginalCurrency = "USD",
): string {
  const value = roundMoney(amount);
  const formatted = formatMoneyAmount(value);

  if (category === "grocery" || category === "amazon") {
    return `CA$${formatted}`;
  }

  if (originalCurrency === "CAD") {
    return `US$${formatMoneyAmount(roundMoney(value / USD_TO_CAD_RATE))}`;
  }
  return `US$${formatted}`;
}

/** Silent budget normalization — always returns a CAD amount. */
export function toBudgetCadAmount(
  amount: number,
  originalCurrency: OriginalCurrency = "USD",
): number {
  if (originalCurrency === "CAD") return roundMoney(amount);
  return roundMoney(amount * USD_TO_CAD_RATE);
}

export function amountVariants(amount: number): string[] {
  const uniq = new Set([
    amount.toFixed(2),
    amount.toFixed(0),
    String(Math.round(amount)),
    formatMoneyAmount(amount),
    formatMoneyAmount(amount).replace(/,/g, ""),
  ]);
  return [...uniq].filter(Boolean);
}

function replaceAmountPatterns(
  text: string,
  amount: number,
  replacer: (matchedAmount: number) => string,
): string {
  let out = text;
  for (const variant of amountVariants(amount)) {
    const e = escapeRegex(variant);
    const patterns = [
      new RegExp(`US\\$\\s*${e}\\b`, "gi"),
      new RegExp(`US\\$${e}\\b`, "gi"),
      new RegExp(`USD\\s*${e}\\b`, "gi"),
      new RegExp(`\\b${e}\\s*USD\\b`, "gi"),
      new RegExp(`CA\\$\\s*${e}\\b`, "gi"),
      new RegExp(`CA\\$${e}\\b`, "gi"),
      new RegExp(`\\b${e}\\s*CAD\\b`, "gi"),
      new RegExp(`\\bCAD\\s*${e}\\b`, "gi"),
      new RegExp(`\\$\\s*${e}\\b`, "g"),
    ];
    for (const pattern of patterns) {
      out = out.replace(pattern, replacer(amount));
    }
  }
  return out;
}

/** Strip conversion / duplicate pricing lines before we append a single canonical block. */
export function stripChatPriceBlocks(text: string): string {
  let out = text;
  const linePatterns = [
    /^[^\n]*\bPrice estimate\b[^\n]*$/gim,
    /^[^\n]*\bEstimated grocery total\b[^\n]*$/gim,
    /^[^\n]*\bIf you approve\b[^\n]*$/gim,
    /^[^\n]*\bconverted from US\$[^\n]*$/gim,
    /^[^\n]*\bUS\$[\d,.]+\s*→\s*CA\$[\d,.]+[^\n]*$/gim,
    /^[^\n]*\b(?:saved|stored|recorded)\s+as\s+(?:about\s+)?CA\$[^\n]*$/gim,
    /^[^\n]*\bCAD conversion\b[^\n]*$/gim,
    /^[^\n]*\bCanadian dollars?\b[^\n]*$/gim,
  ];
  for (const pattern of linePatterns) {
    out = out.replace(pattern, "");
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/** Normalize assistant prose for one order — category display rules only. */
export function normalizeCurrencyInReplyForOrder(
  text: string,
  category: OrderCategory,
  order: { totalEstimatedPrice: number; items: { estimatedPrice: number; qty: number }[] },
  originalCurrency: OriginalCurrency = "USD",
): string {
  let out = text;
  const amounts = new Set<number>([order.totalEstimatedPrice]);
  for (const item of order.items) {
    amounts.add(item.estimatedPrice);
    amounts.add(roundMoney(item.estimatedPrice * item.qty));
  }

  if (category === "grocery" || category === "amazon") {
    for (const amt of amounts) {
      const label = formatCurrencyByCategory(category, amt, originalCurrency);
      out = replaceAmountPatterns(out, amt, () => label);
    }
    out = out.replace(/\bUSD\b/gi, "CAD");
    out = out.replace(/\bUS dollars?\b/gi, "Canadian dollars");
    out = out.replace(/\bUnited States dollars?\b/gi, "Canadian dollars");
    return out;
  }

  for (const amt of amounts) {
    const label = formatCurrencyByCategory("other", amt, originalCurrency);
    out = replaceAmountPatterns(out, amt, () => label);
  }
  out = out.replace(/\bCAD\b/gi, "USD");
  out = out.replace(/\bCanadian dollars?\b/gi, "US dollars");
  out = out.replace(/\([^)]*CAD[^)]*\)/gi, "");
  out = out.replace(/\s*→\s*CA\$[\d,.]+/gi, "");
  return out;
}
