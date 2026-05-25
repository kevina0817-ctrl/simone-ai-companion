import type { OrderLineItem } from "@/lib/pending-order";

export type GroceryPricingMode = "per_unit" | "package";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Units where the listed estimated price is the full line total (no multiply). */
const PACKAGE_UNIT_PATTERN =
  /\b(?:oz|fl\s*oz|ml|milliliters?|liters?|l\b|g\b|grams?|kg|kilograms?|dozen|bag|bags|can|cans|container|bottle|tub|carton|jar|pack|package|box)\b/i;

/** Units where quantity × unit price applies. */
const PER_UNIT_MEASURE_PATTERN =
  /\b(?:lbs?|pounds?|cups?|heads?|pieces?|piece|medium|each|count|stalks?|bunches?|ears?|cloves?)\b/i;

export function inferGroceryPricingMode(unit: string | undefined, explicit?: GroceryPricingMode): GroceryPricingMode {
  if (explicit === "per_unit" || explicit === "package") return explicit;
  const u = (unit ?? "").trim().toLowerCase();
  if (!u) return "per_unit";
  if (PER_UNIT_MEASURE_PATTERN.test(u)) return "per_unit";
  if (PACKAGE_UNIT_PATTERN.test(u)) return "package";
  return "per_unit";
}

export function formatGroceryQuantityLabel(item: OrderLineItem): string {
  const n = item.quantity ?? item.qty;
  if (item.unit?.trim()) {
    const unit = item.unit.trim();
    if (/^\d/.test(unit)) return unit;
    if (/^\d+\s*(?:oz|ml|g|kg|lb)\b/i.test(unit)) return unit;
    return `${n} ${unit}`;
  }
  return String(n);
}

export function computeGroceryLineTotal(item: OrderLineItem): number {
  const unitPrice = item.estimatedPrice;
  const mode = item.pricingMode ?? inferGroceryPricingMode(item.unit);
  if (mode === "package") return roundMoney(unitPrice);
  const quantity = item.quantity ?? item.qty;
  return roundMoney(quantity * unitPrice);
}

export function isGroceryPricedLineItem(item: OrderLineItem): boolean {
  return Boolean(item.unit?.trim() || item.pricingMode);
}

/** Acceptance example — programmatic total CA$93.00 */
export const GROCERY_93_EXAMPLE: OrderLineItem[] = [
  { name: "Chicken Breast", qty: 3, quantity: 3, unit: "lbs", estimatedPrice: 9, pricingMode: "per_unit" },
  { name: "Ground Turkey", qty: 2, quantity: 2, unit: "lbs", estimatedPrice: 7, pricingMode: "per_unit" },
  { name: "Eggs", qty: 1, quantity: 1, unit: "dozen", estimatedPrice: 3, pricingMode: "package" },
  { name: "Quinoa", qty: 2, quantity: 2, unit: "cups", estimatedPrice: 4, pricingMode: "per_unit" },
  { name: "Brown Rice", qty: 2, quantity: 2, unit: "cups", estimatedPrice: 2, pricingMode: "per_unit" },
  { name: "Broccoli", qty: 2, quantity: 2, unit: "heads", estimatedPrice: 4, pricingMode: "per_unit" },
  { name: "Spinach", qty: 1, quantity: 1, unit: "bag", estimatedPrice: 2, pricingMode: "package" },
  { name: "Sweet Potatoes", qty: 4, quantity: 4, unit: "medium", estimatedPrice: 4, pricingMode: "per_unit" },
  { name: "Almonds", qty: 1, quantity: 1, unit: "lb", estimatedPrice: 6, pricingMode: "per_unit" },
  { name: "Greek Yogurt", qty: 1, quantity: 32, unit: "oz", estimatedPrice: 5, pricingMode: "package" },
];

export function enrichGroceryLineItem(item: OrderLineItem): OrderLineItem {
  const quantity = item.quantity ?? item.qty;
  const qty = Math.max(1, Math.round(item.qty || quantity));
  const pricingMode = item.pricingMode ?? inferGroceryPricingMode(item.unit);
  const lineTotal = computeGroceryLineTotal({ ...item, quantity, qty, pricingMode });
  return {
    ...item,
    quantity,
    qty,
    pricingMode,
    lineTotal,
  };
}
