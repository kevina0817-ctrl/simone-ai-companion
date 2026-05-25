export type OrderCategory = "grocery" | "amazon" | "other";

/** Grocery and Amazon orders are always priced and displayed in CAD (CA$). */
export const CAD_DEFAULT_ORDER_CATEGORIES: readonly OrderCategory[] = ["grocery", "amazon"];

export function isCadDefaultOrderCategory(category: OrderCategory): boolean {
  return category === "grocery" || category === "amazon";
}

/** Classify store/title for Orders tabs (never used for calendar events). */
export function inferOrderCategory(store: string, title?: string): OrderCategory {
  const s = `${store} ${title ?? ""}`.toLowerCase();
  if (/\bamazon\b/.test(s)) return "amazon";
  if (
    /\b(whole foods|trader joe|t&t|tnt|grocery|groceries|target|costco|safeway|kroger|wegmans)\b/.test(
      s,
    )
  ) {
    return "grocery";
  }
  return "other";
}

export function isShoppingOrderCategory(category: OrderCategory): boolean {
  return category === "grocery" || category === "amazon" || category === "other";
}
