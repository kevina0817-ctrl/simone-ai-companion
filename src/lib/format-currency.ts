/** All user-facing prices use Canadian dollars (CA$). */

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

export function amountVariants(amount: number): string[] {
  const value = roundMoney(amount);
  const formatted = formatCurrency(value).replace(/^CA\$/, "");
  const uniq = new Set([
    value.toFixed(2),
    value.toFixed(0),
    String(Math.round(value)),
    formatted,
    formatted.replace(/,/g, ""),
  ]);
  return [...uniq].filter(Boolean);
}

/** Remove conversion / duplicate pricing lines from assistant copy. */
export function stripChatPriceBlocks(text: string): string {
  let out = text;
  const linePatterns = [
    /^[^\n]*\bPrice estimate\b[^\n]*$/gim,
    /^[^\n]*\bEstimated grocery total\b[^\n]*$/gim,
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

/** Rewrite US$/USD/$ price labels to CA$ (same numeric amount). */
export function normalizeCurrencyInText(text: string, amounts?: number[]): string {
  let out = text;
  const seen = amounts ?? [];

  for (const amt of seen) {
    const label = formatCurrency(amt);
    for (const variant of amountVariants(amt)) {
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
        out = out.replace(pattern, label);
      }
    }
  }

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
