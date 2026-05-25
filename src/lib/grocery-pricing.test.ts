import { describe, expect, it } from "vitest";
import {
  computeGroceryLineTotal,
  enrichGroceryLineItem,
  inferGroceryPricingMode,
} from "@/lib/grocery-pricing";
import { GROCERY_93_EXAMPLE } from "@/lib/grocery-pricing";
import { computeOrderTotal } from "@/lib/pending-order";

describe("inferGroceryPricingMode", () => {
  it("treats package/volume units as flat price", () => {
    expect(inferGroceryPricingMode("dozen")).toBe("package");
    expect(inferGroceryPricingMode("32 oz")).toBe("package");
    expect(inferGroceryPricingMode("bag")).toBe("package");
    expect(inferGroceryPricingMode("can")).toBe("package");
  });

  it("treats count/weight measures as per_unit", () => {
    expect(inferGroceryPricingMode("lbs")).toBe("per_unit");
    expect(inferGroceryPricingMode("cups")).toBe("per_unit");
    expect(inferGroceryPricingMode("heads")).toBe("per_unit");
    expect(inferGroceryPricingMode("medium")).toBe("per_unit");
    expect(inferGroceryPricingMode("lb")).toBe("per_unit");
  });
});

describe("computeGroceryLineTotal", () => {
  it("multiplies per_unit lines and flat-rates package lines", () => {
    expect(computeGroceryLineTotal(GROCERY_93_EXAMPLE[0]!)).toBe(27);
    expect(computeGroceryLineTotal(GROCERY_93_EXAMPLE[2]!)).toBe(3);
    expect(computeGroceryLineTotal(GROCERY_93_EXAMPLE[9]!)).toBe(5);
  });

  it("order total is CA$93.00 for the example list", () => {
    expect(computeOrderTotal(GROCERY_93_EXAMPLE)).toBe(93);
    const unitOnlySum = GROCERY_93_EXAMPLE.reduce((s, i) => s + i.estimatedPrice, 0);
    expect(computeOrderTotal(GROCERY_93_EXAMPLE)).not.toBe(unitOnlySum);
  });

  it("enrichGroceryLineItem sets lineTotal from pricingMode", () => {
    const eggs = enrichGroceryLineItem({
      name: "Eggs",
      qty: 1,
      quantity: 1,
      unit: "dozen",
      estimatedPrice: 3,
    });
    expect(eggs.pricingMode).toBe("package");
    expect(eggs.lineTotal).toBe(3);
  });
});
