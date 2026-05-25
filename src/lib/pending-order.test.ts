import { describe, expect, it } from "vitest";
import {
  computeLineTotal,
  computeOrderTotal,
  recomputePendingOrderTotals,
  type OrderLineItem,
} from "@/lib/pending-order";

/** User-reported example: unit prices summed incorrectly as $66 instead of qty-weighted $99. */
const PROTEIN_GROCERY_ITEMS: OrderLineItem[] = [
  { name: "Chicken Breast", qty: 2, estimatedPrice: 9 },
  { name: "Brown Rice", qty: 2, estimatedPrice: 4 },
  { name: "Quinoa", qty: 1, estimatedPrice: 3.5 },
  { name: "Broccoli", qty: 1, estimatedPrice: 2 },
  { name: "Spinach", qty: 1, estimatedPrice: 3 },
  { name: "Eggs", qty: 1, estimatedPrice: 2.5 },
  { name: "Greek Yogurt", qty: 1, estimatedPrice: 5 },
  { name: "Canned Tuna", qty: 4, estimatedPrice: 6 },
  { name: "Almonds", qty: 1, estimatedPrice: 8 },
  { name: "Protein Powder", qty: 1, estimatedPrice: 25 },
];

describe("computeOrderTotal", () => {
  it("sums qty × unit price per line (not unit prices only)", () => {
    expect(computeOrderTotal(PROTEIN_GROCERY_ITEMS)).toBe(99);
    const unitOnlySum = PROTEIN_GROCERY_ITEMS.reduce((s, i) => s + i.estimatedPrice, 0);
    expect(computeOrderTotal(PROTEIN_GROCERY_ITEMS)).not.toBe(unitOnlySum);
  });

  it("computeLineTotal multiplies quantity", () => {
    expect(computeLineTotal({ name: "Chicken Breast", qty: 2, estimatedPrice: 9 })).toBe(18);
    expect(computeLineTotal({ name: "Canned Tuna", qty: 4, estimatedPrice: 6 })).toBe(24);
  });

  it("recomputePendingOrderTotals fixes wrong stored total", () => {
    const order = recomputePendingOrderTotals({
      id: "x",
      title: "Groceries",
      store: "Whole Foods",
      category: "grocery",
      items: PROTEIN_GROCERY_ITEMS,
      totalEstimatedPrice: 66,
      status: "pending_approval",
      createdAt: new Date().toISOString(),
    });
    expect(order.totalEstimatedPrice).toBe(99);
  });
});
