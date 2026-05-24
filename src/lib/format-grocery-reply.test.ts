import { describe, expect, it } from "vitest";
import { applyChatCurrencyToReply, formatChatOrderPriceSummary } from "@/lib/chat-order-currency";
import {
  formatGroceryItemBlock,
  formatGroceryListBlock,
  formatShoppingItemLine,
  rebuildReplyWithGroceryItems,
} from "@/lib/format-grocery-reply";
import { GROCERY_93_EXAMPLE } from "@/lib/grocery-pricing";
import { formatCurrency, repairCorruptedCurrency } from "@/lib/format-currency";
import { computeOrderTotal, type OrderLineItem, type PendingOrder } from "@/lib/pending-order";

function groceryOrder(items: PendingOrder["items"]): PendingOrder {
  return {
    id: "g-1",
    title: "Weekly groceries",
    store: "Whole Foods",
    category: "grocery",
    items,
    totalEstimatedPrice: computeOrderTotal(items),
    status: "pending_approval",
    createdAt: new Date().toISOString(),
  };
}

describe("formatGroceryListBlock", () => {
  it("formats simple count items without unit", () => {
    const block = formatGroceryListBlock([
      { name: "Chicken Breast", qty: 1, estimatedPrice: 12.99 },
      { name: "Ground Turkey", qty: 1, estimatedPrice: 7.99 },
    ]);
    expect(block).toBe("1. Chicken Breast (CA$12.99)\n\n2. Ground Turkey (CA$7.99)");
  });

  it("shows qty × unit = line total when qty > 1", () => {
    expect(formatShoppingItemLine(1, { name: "Chicken Breast", qty: 2, estimatedPrice: 9 })).toBe(
      "1. Chicken Breast — 2 × CA$9.00 = CA$18.00",
    );
  });

  it("renders grocery blocks with package flat pricing", () => {
    const block = formatGroceryItemBlock(3, GROCERY_93_EXAMPLE[2]!);
    expect(block).toContain("1 dozen");
    expect(block).toContain("Line Total: CA$3.00");
    expect(block).not.toContain("1 ×");
  });

  it("renders per_unit grocery blocks with multiply", () => {
    const block = formatGroceryItemBlock(1, GROCERY_93_EXAMPLE[0]!);
    expect(block).toContain("Quantity: 3 lbs");
    expect(block).toContain("3 × CA$9.00 = CA$27.00");
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
  it("reports CA$99.00 for legacy count-only items", () => {
    expect(computeOrderTotal(PROTEIN_GROCERY_ITEMS)).toBe(99);
    const order = groceryOrder(PROTEIN_GROCERY_ITEMS);
    order.totalEstimatedPrice = 66;
    expect(formatChatOrderPriceSummary(order)).toBe("Total Estimated Price: CA$99.00");
  });

  it("reports CA$93.00 for structured grocery example", () => {
    const order = groceryOrder(GROCERY_93_EXAMPLE);
    expect(formatChatOrderPriceSummary(order)).toBe("Total Estimated Price: CA$93.00");
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
  });

  it("shows computed Total Estimated Price for structured grocery list", () => {
    const order = groceryOrder(GROCERY_93_EXAMPLE);
    const out = applyChatCurrencyToReply(
      "Here is your list.\n\nEstimated Total Price: $66.00\n\nWant me to create the order?",
      [order],
      { userMessage: "What groceries should I get this week?" },
    );
    expect(out).toContain("Total Estimated Price: CA$93.00");
    expect(out).not.toContain("$66.00");
    expect(out).toContain("3 × CA$9.00 = CA$27.00");
    expect(out).toContain("Line Total: CA$3.00");
    expect(out).not.toMatch(/\bUS\$|\bUSD\b/i);
  });

  it("replaces LLM unit-sum total on confirm", () => {
    const order = groceryOrder(PROTEIN_GROCERY_ITEMS);
    const out = applyChatCurrencyToReply(
      "Estimated Total Price: $66.00\n\nShall I create the order?",
      [order],
      { userMessage: "Yes, create the pending grocery order" },
    );
    expect(out).toContain("Finalized price: approximately CA$99.00.");
    expect(out).not.toContain("$66.00");
    expect(out).not.toMatch(/Price estimate/i);
  });

  it("grocery order confirmation strips USD and uses finalized CAD", () => {
    const items = Array.from({ length: 13 }, (_, i) => ({
      name: `Item ${i + 1}`,
      qty: 1,
      estimatedPrice: i < 12 ? 12.31 : 12.28,
    }));
    const order = groceryOrder(items);
    expect(computeOrderTotal(items)).toBe(160);

    const out = applyChatCurrencyToReply(
      "I've created your grocery order for the muscle-building meal prep and sent it to your approvals queue. The order includes 13 items.\n\nPrice estimate: approximately US$160.00 (USD).",
      [order],
      { userMessage: "Yes, create an order and send it to approval" },
    );
    expect(out).toContain("approvals queue");
    expect(out).toContain("13 items");
    expect(out).toContain("Finalized price: approximately CA$160.00.");
    expect(out).not.toMatch(/Price estimate|US\$|USD|\(USD\)/i);
  });
});

describe("repairCorruptedCurrency", () => {
  it("fixes repeated CA prefixes and decimal tails", () => {
    expect(repairCorruptedCurrency("CACA$12.99")).toBe("CA$12.99");
    expect(repairCorruptedCurrency("CA$6.99.99")).toBe("CA$6.99");
  });
});

describe("rebuildReplyWithGroceryItems", () => {
  it("never double-formats", () => {
    const items = [{ name: "Eggs", qty: 1, estimatedPrice: 3.49 }];
    const once = rebuildReplyWithGroceryItems("Intro\n\n1. Eggs $3\n\nCreate order?", items);
    const twice = rebuildReplyWithGroceryItems(once, items);
    expect(twice).toBe(once);
    expect(formatCurrency(3.49)).toBe("CA$3.49");
  });
});
