export type OrderCategory = "grocery" | "amazon" | "other";

/** Classify store/title for Orders tabs (never used for calendar events). */
export function inferOrderCategory(store: string, title?: string): OrderCategory {
  const s = `${store} ${title ?? ""}`.toLowerCase();
  if (/\bamazon\b/.test(s)) return "amazon";
  if (
    /\b(whole foods|trader joe|grocery|groceries|target|costco|safeway|kroger|wegmans)\b/.test(
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
