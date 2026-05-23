import { describe, expect, it } from "vitest";
import { applyChatCurrencyToReply, formatChatOrderPriceSummary } from "@/lib/chat-order-currency";
import { formatGroceryListBlock, formatShoppingItemLine, rebuildReplyWithGroceryItems } from "@/lib/format-grocery-reply";
import { formatCurrency, repairCorruptedCurrency } from "@/lib/format-currency";
import { computeOrderTotal, type OrderLineItem, type PendingOrder } from "@/lib/pending-order";

function groceryOrder(items: PendingOrder["items"]): PendingOrder {
  return {
    id: "g-1",
    title: "Weekly groceries",
    store: "Whole Foods",
    category: "grocery",
    items,
    totalEstimatedPrice: items.reduce((s, i) => s + i.estimatedPrice * i.qty, 0),
    status: "pending_approval",
    createdAt: new Date().toISOString(),
  };
}

describe("formatGroceryListBlock", () => {
  it("formats each line once from numeric prices", () => {
    const block = formatGroceryListBlock([
      { name: "Chicken Breast", qty: 1, estimatedPrice: 12.99 },
      { name: "Ground Turkey", qty: 1, estimatedPrice: 7.99 },
    ]);
    expect(block).toBe(
      "1. Chicken Breast (CA$12.99)\n2. Ground Turkey (CA$7.99)",
    );
  });

  it("shows qty × unit = line total when qty > 1", () => {
    expect(formatShoppingItemLine(1, { name: "Chicken Breast", qty: 2, estimatedPrice: 9 })).toBe(
      "1. Chicken Breast — 2 × CA$9.00 = CA$18.00",
    );
    expect(formatShoppingItemLine(8, { name: "Canned Tuna", qty: 4, estimatedPrice: 6 })).toBe(
      "8. Canned Tuna — 4 × CA$6.00 = CA$24.00",
    );
  });
});

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

describe("grocery order total from line items", () => {
  it("reports CA$99.00 for the protein grocery example", () => {
    expect(computeOrderTotal(PROTEIN_GROCERY_ITEMS)).toBe(99);
    const order = groceryOrder(PROTEIN_GROCERY_ITEMS);
    order.totalEstimatedPrice = 66;
    expect(formatChatOrderPriceSummary(order)).toBe("Estimated Total Price: CA$99.00");
  });
});

describe("applyChatCurrencyToReply — no corrupted prices", () => {
  it("does not produce CACA$ when reply already has CA$ prices", () => {
    const text =
      "Here's your list:\n\n" +
      "1. Eggs (CA$6.99)\n2. Milk (CA$3.49)\n\nShall I create a pending grocery order?";
    const out = applyChatCurrencyToReply(text, [], {
      userMessage: "What groceries should I get this week?",
    });
    expect(out).not.toMatch(/CACA/i);
    expect(out).toContain("CA$6.99");
    expect(out).not.toMatch(/6\.99\.99/);
  });

  it("rebuilds list from structured items instead of re-formatting LLM prices", () => {
    const order = groceryOrder([
      { name: "Chicken Breast", qty: 1, estimatedPrice: 12.99 },
      { name: "Ground Turkey", qty: 1, estimatedPrice: 7.99 },
    ]);
    const messy =
      "Weekly groceries:\n\n" +
      "1. Chicken — CACA$12.99\n2. Turkey — CACACA$7.99.49\n\n" +
      "### Total Estimated Price: CA$20.98\n\nShall I create the order?";

    const out = applyChatCurrencyToReply(messy, [order], {
      userMessage: "What groceries should I get?",
    });
    expect(out).not.toMatch(/CACA/i);
    expect(out).not.toMatch(/\.49\.49/);
    expect(out).toContain("1. Chicken Breast (CA$12.99)");
    expect(out).toContain("2. Ground Turkey (CA$7.99)");
    expect(out).not.toMatch(/Total Estimated Price/i);
  });

  it("replaces LLM unit-sum total with qty-weighted total on confirm", () => {
    const order = groceryOrder(PROTEIN_GROCERY_ITEMS);
    const out = applyChatCurrencyToReply(
      "Estimated Total Price: $66.00\n\nShall I create the order?",
      [order],
      { userMessage: "Yes, create the pending grocery order" },
    );
    expect(out).toContain("Estimated Total Price: CA$99.00");
    expect(out).not.toContain("$66.00");
    expect(out).toContain("2 × CA$9.00 = CA$18.00");
  });

  it("shows grocery total only after confirm", () => {
    const order = groceryOrder([{ name: "Spinach", qty: 1, estimatedPrice: 4.5 }]);
    order.totalEstimatedPrice = 4.5;

    const confirmed = applyChatCurrencyToReply("Order created.", [order], {
      userMessage: "Yes, create the pending grocery order",
    });
    expect(confirmed).toContain("Estimated Total Price: CA$4.50");
  });
});

describe("repairCorruptedCurrency", () => {
  it("fixes repeated CA prefixes and decimal tails", () => {
    expect(repairCorruptedCurrency("CACA$12.99")).toBe("CA$12.99");
    expect(repairCorruptedCurrency("CA$6.99.99")).toBe("CA$6.99");
    expect(repairCorruptedCurrency("CACACA$7.99.49.49")).toBe("CA$7.99");
  });
});

describe("rebuildReplyWithGroceryItems", () => {
  it("never double-formats", () => {
    const items = [{ name: "Eggs", qty: 1, estimatedPrice: 3.49 }];
    const once = rebuildReplyWithGroceryItems("Intro\n\n1. Eggs $3\n\nCreate order?", items);
    const twice = rebuildReplyWithGroceryItems(once, items);
    expect(twice).toBe(once);
    expect(formatCurrency(3.49)).toBe("CA$3.49");
    expect(twice).toContain("(CA$3.49)");
    expect(twice).not.toMatch(/CACA/);
  });
});
