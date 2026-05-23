/** Platform default — all user-facing order and budget prices use Canadian dollars. */
export const DEFAULT_CURRENCY = "CAD" as const;

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Canonical display format for every price in the app.
 * @example formatCurrency(2700) → "CA$2,700.00"
 */
export function formatCurrency(amount: number): string {
  const value = roundMoney(Number(amount));
  const formatted = value.toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `CA$${formatted}`;
}

/** Parse a numeric amount — never pass formatted strings like "CA$12.99". */
export function parseMoneyAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return roundMoney(value);
  if (typeof value !== "string") return null;
  const stripped = value.replace(/,/g, "").replace(/[^\d.-]/g, "");
  if (!stripped) return null;
  const n = Number.parseFloat(stripped);
  return Number.isFinite(n) ? roundMoney(n) : null;
}

/** True when a line contains non-CAD currency markers (order flows must not show these). */
export function lineContainsForbiddenOrderCurrency(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/\bUS\$/i.test(t)) return true;
  if (/\bUSD\b/i.test(t)) return true;
  if (/\bUS\s+dollars?\b/i.test(t)) return true;
  if (/\bUnited\s+States\s+dollars?\b/i.test(t)) return true;
  if (/\(\s*USD\s*\)/i.test(t)) return true;
  if (/\(\s*in\s+USD\s*\)/i.test(t)) return true;
  if (/\bconverted\s+(?:to|from)\b/i.test(t)) return true;
  if (/\bexchange\s+rate\b/i.test(t)) return true;
  if (/\b(?:CAD|USD)\s+conversion\b/i.test(t)) return true;
  if (/\bafter conversion\b/i.test(t)) return true;
  if (/\s→\s*/.test(t) && /\$/.test(t)) return true;
  if (/(?<![A-Z])\$\s*[\d,]+(?:\.\d{2})?/.test(t) && !/CA\$/i.test(t)) return true;
  return false;
}

export function containsForbiddenOrderCurrency(text: string): boolean {
  return text.split("\n").some(lineContainsForbiddenOrderCurrency);
}

/** @deprecated Use containsForbiddenOrderCurrency */
export const containsUsdCurrencyMarkers = containsForbiddenOrderCurrency;

/** Remove LLM-authored price / conversion lines — server injects CA$ via formatCurrency only. */
export function stripForbiddenOrderCurrencyLines(text: string): string {
  const kept = text.split("\n").filter((line) => !lineContainsForbiddenOrderCurrency(line));
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Remove duplicate / conversion pricing blocks from assistant copy. */
export function stripChatPriceBlocks(text: string): string {
  let out = text;
  const linePatterns = [
    /^[^\n]*\bPrice estimate\b[^\n]*$/gim,
    /^[^\n]*\bEstimated grocery total\b[^\n]*$/gim,
    /^#{1,6}\s*Total\s+Estimated\s+Price:?\s*.*$/gim,
    /^Total\s+Estimated\s+Price:?\s*.*$/gim,
    /^[^\n]*\b(?:Grand\s+)?(?<!Line\s)total\s*(?:estimated)?:?\s*CA\$[^\n]*$/gim,
    /^[^\n]*\bIf you approve\b[^\n]*$/gim,
    /^[^\n]*\bconverted from\b[^\n]*$/gim,
    /^[^\n]*\b(?:saved|stored|recorded)\s+as\s+(?:about\s+)?CA\$[^\n]*$/gim,
    /^[^\n]*\bafter conversion\b[^\n]*$/gim,
    /^[^\n]*\bexchange rate\b[^\n]*$/gim,
  ];
  for (const pattern of linePatterns) {
    out = out.replace(pattern, "");
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/** Remove order-level totals from grocery copy (LLM must not invent totals). */
export function stripGroceryTotalFromReply(text: string): string {
  let out = text;
  const patterns = [
    /^#{1,6}\s*Total\s+Estimated\s+Price:?\s*.*$/gim,
    /^#{1,6}\s*Estimated\s+Total\s+Price:?\s*.*$/gim,
    /^Total\s+Estimated\s+Price:?\s*.*$/gim,
    /^Estimated\s+Total\s+Price:?\s*.*$/gim,
    /^[^\n]*\bEstimated\s+Total\s+Price\b[^\n]*$/gim,
    /^[^\n]*\bEstimated\s+(?:grocery\s+)?total\b[^\n]*$/gim,
    /^[^\n]*\b(?:Grand\s+)?(?<!Line\s)total\s*(?:estimated)?:?\s*(?:CA\$|\$)[^\n]*$/gim,
    /^[^\n]*\bTotal\s+(?:estimated\s+)?(?:price|cost):?\s*(?:CA\$|\$)[^\n]*$/gim,
    /^[^\n]*\bAmazon\s+order\s+total\b[^\n]*$/gim,
  ];
  for (const pattern of patterns) {
    out = out.replace(pattern, "");
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/** Fix strings corrupted by repeated CA$ prefixing or decimal duplication. */
export function repairCorruptedCurrency(text: string): string {
  let out = text;
  out = out.replace(/(?:CA)+(\$[\d,]+(?:\.\d{2})?)/gi, "CA$1");
  out = out.replace(/(CA\$\d{1,3}(?:,\d{3})*\.\d{2})(?:\.\d{2})+/gi, "$1");
  out = out.replace(/(CA\$\d+\.\d{2})(?:\.\d{2})+/gi, "$1");
  return out;
}

export function collectAmountsFromOrder(order: {
  totalEstimatedPrice: number;
  items: { estimatedPrice: number; qty: number }[];
}): number[] {
  const amounts = new Set<number>([order.totalEstimatedPrice]);
  for (const item of order.items) {
    amounts.add(item.estimatedPrice);
    amounts.add(roundMoney(item.estimatedPrice * item.qty));
  }
  return [...amounts];
}
