/** All user-facing prices use Canadian dollars (CA$). */

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Canonical display format for every price in the app.
 * @example formatCurrency(2700) → "CA$2,700.00"
 */
export function formatCurrency(amount: number): string {
  const value = roundMoney(amount);
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

/** Remove conversion / duplicate pricing lines from assistant copy. */
export function stripChatPriceBlocks(text: string): string {
  let out = text;
  const linePatterns = [
    /^[^\n]*\bPrice estimate\b[^\n]*$/gim,
    /^[^\n]*\bEstimated grocery total\b[^\n]*$/gim,
    /^#{1,6}\s*Total\s+Estimated\s+Price:?\s*.*$/gim,
    /^Total\s+Estimated\s+Price:?\s*.*$/gim,
    /^[^\n]*\b(?:Grand\s+)?total\s*(?:estimated)?:?\s*CA\$[^\n]*$/gim,
    /^[^\n]*\bIf you approve\b[^\n]*$/gim,
    /^[^\n]*\bconverted from\b[^\n]*$/gim,
    /^[^\n]*\bUS\$[\d,.]+\s*→\s*CA\$[\d,.]+[^\n]*$/gim,
    /^[^\n]*\b(?:saved|stored|recorded)\s+as\s+(?:about\s+)?CA\$[^\n]*$/gim,
    /^[^\n]*\b(?:CAD|USD)\s+conversion\b[^\n]*$/gim,
    /^[^\n]*\bafter conversion\b[^\n]*$/gim,
    /^[^\n]*\bexchange rate\b[^\n]*$/gim,
  ];
  for (const pattern of linePatterns) {
    out = out.replace(pattern, "");
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/** Remove order-level totals from first grocery proposal copy (per-item prices stay). */
export function stripGroceryTotalFromReply(text: string): string {
  let out = text;
  const patterns = [
    /^#{1,6}\s*Total\s+Estimated\s+Price:?\s*.*$/gim,
    /^Total\s+Estimated\s+Price:?\s*.*$/gim,
    /^[^\n]*\bEstimated\s+(?:grocery\s+)?total\b[^\n]*$/gim,
    /^[^\n]*\b(?:Grand\s+)?total\s*(?:estimated)?:?\s*CA\$[^\n]*$/gim,
    /^[^\n]*\bTotal\s+(?:estimated\s+)?(?:price|cost):?\s*CA\$[^\n]*$/gim,
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

/**
 * One-pass US$/USD → CA$ for foreign labels only. Does not re-format existing CA$ amounts.
 * @deprecated Prefer rendering prices from numeric fields; avoid running on full assistant replies.
 */
export function normalizeCurrencyInText(text: string): string {
  let out = repairCorruptedCurrency(text);
  out = out.replace(/\bUS\$\s*([\d,]+(?:\.\d{2})?)/gi, (_, n) =>
    formatCurrency(Number.parseFloat(String(n).replace(/,/g, ""))),
  );
  out = out.replace(/\bUSD\s*([\d,]+(?:\.\d{2})?)/gi, (_, n) =>
    formatCurrency(Number.parseFloat(String(n).replace(/,/g, ""))),
  );
  out = out.replace(/\bUS dollars?\b/gi, "Canadian dollars");
  out = out.replace(/\bUnited States dollars?\b/gi, "Canadian dollars");
  out = out.replace(/\bUSD\b/gi, "CAD");
  out = out.replace(/\s*→\s*CA\$[\d,.]+/gi, "");
  out = out.replace(/\([^)]*\bconversion\b[^)]*\)/gi, "");
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
