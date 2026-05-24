import { describe, expect, it } from "vitest";
import { applyChatCurrencyToReply, formatChatOrderPriceSummary } from "@/lib/chat-order-currency";
import {
  containsForbiddenOrderCurrency,
  DEFAULT_CURRENCY,
  formatCurrency,
  sanitizeOrderConfirmationReply,
  stripChatPriceBlocks,
  stripForbiddenOrderCurrencyLines,
} from "@/lib/format-currency";
import type { PendingOrder } from "@/lib/pending-order";

function sampleOrder(overrides: Partial<PendingOrder>): PendingOrder {
  return {
    id: "o-1",
    title: "Weekly groceries",
    store: "Whole Foods",
    category: "grocery",
    items: [{ name: "Spinach", qty: 1, estimatedPrice: 128.5 }],
    totalEstimatedPrice: 128.5,
    status: "pending_approval",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("formatCurrency", () => {
  it("defaults to CAD formatting", () => {
    expect(DEFAULT_CURRENCY).toBe("CAD");
    expect(formatCurrency(2700)).toBe("CA$2,700.00");
    expect(formatCurrency(128.5)).toBe("CA$128.50");
  });
});

describe("applyChatCurrencyToReply", () => {
  it("grocery proposal strips LLM totals; confirm shows server total", () => {
    const order = sampleOrder({});
    const proposal = applyChatCurrencyToReply(
      "### Total Estimated Price: CA$128.50\n\nShall I create the order?",
      [],
      { userMessage: "Suggest a grocery list for Whole Foods" },
    );
    expect(proposal).not.toMatch(/Total Estimated Price/i);
    expect(containsForbiddenOrderCurrency(proposal)).toBe(false);

    const confirmed = applyChatCurrencyToReply("Creating your pending grocery order.", [order], {
      userMessage: "Yes, create the pending grocery order",
    });
    expect(confirmed).toContain("Finalized price: approximately CA$128.50.");
    expect(confirmed).not.toMatch(/Price estimate/i);
    expect(containsForbiddenOrderCurrency(confirmed)).toBe(false);
  });

  it("luxury order strips LLM USD and injects finalized CAD price only", () => {
    const order = sampleOrder({
      title: "Louis Vuitton Neverfull",
      store: "Louis Vuitton",
      category: "other",
      items: [{ name: "Louis Vuitton Neverfull", qty: 1, estimatedPrice: 2700 }],
      totalEstimatedPrice: 2700,
    });
    const messy =
      "Price estimate: approximately CAD 2,700.00.\n" +
      "Price estimate: approximately US$2700.00.\n" +
      "US$2700.00 → CA$3672.00\n" +
      "If you approve, it will be saved as about CA$3672.00 after conversion.";
    const reply = applyChatCurrencyToReply(messy, [order], {
      userMessage: "I want the Louis Vuitton Neverfull",
    });
    expect(containsForbiddenOrderCurrency(reply)).toBe(false);
    expect(reply).toContain("Finalized price: approximately CA$2,700.00.");
    expect(reply).not.toMatch(/Price estimate/i);
    expect(reply).not.toMatch(/US\$|USD|→|conversion|\(USD\)/i);
    expect((reply.match(/Finalized price/g) ?? []).length).toBe(1);
  });

  it("amazon summary uses finalized CAD label", () => {
    const order = sampleOrder({
      category: "amazon",
      store: "Amazon",
      title: "AirPods",
      items: [{ name: "AirPods", qty: 1, estimatedPrice: 349.99 }],
      totalEstimatedPrice: 349.99,
    });
    expect(formatChatOrderPriceSummary(order)).toBe("Finalized price: approximately CA$349.99.");
  });

  it("formats $71 luxury confirmation as finalized CAD", () => {
    const order = sampleOrder({
      category: "other",
      title: "Running shoes",
      store: "Sport Chek",
      items: [{ name: "Running shoes", qty: 1, estimatedPrice: 71 }],
      totalEstimatedPrice: 71,
    });
    const out = applyChatCurrencyToReply(
      "Price estimate: approximately US$71.00 (USD).",
      [order],
      { userMessage: "Yes, create the order for those shoes" },
    );
    expect(out).toBe("Finalized price: approximately CA$71.00.");
    expect(out).not.toMatch(/Price estimate|US\$|USD|\(USD\)/i);
  });

  it("removes US$ from grocery proposal without structured orders", () => {
    const messy =
      "Weekly groceries:\n\n" +
      "1. Eggs — US$6.99 (USD)\n" +
      "Estimated Price: US$12.00\n" +
      "Converted to CA$15.00 at today's exchange rate.\n\n" +
      "Shall I create the order?";
    const out = applyChatCurrencyToReply(messy, [], {
      userMessage: "What groceries should I get?",
    });
    expect(containsForbiddenOrderCurrency(out)).toBe(false);
    expect(out).not.toMatch(/US\$|USD/i);
    expect(out).toContain("Shall I create the order?");
  });

  it("amazon order strips LLM USD and shows finalized CAD total", () => {
    const order = sampleOrder({
      category: "amazon",
      store: "Amazon",
      title: "AirPods Pro",
      items: [{ name: "AirPods Pro", qty: 1, estimatedPrice: 349.99 }],
      totalEstimatedPrice: 349.99,
    });
    const out = applyChatCurrencyToReply(
      "Price estimate: approximately US$349.99 (USD).\n\nShall I add this to Approvals?",
      [order],
      { userMessage: "Order AirPods from Amazon" },
    );
    expect(containsForbiddenOrderCurrency(out)).toBe(false);
    expect(out).toContain("Finalized price: approximately CA$349.99.");
    expect(out).not.toMatch(/Price estimate/i);
    expect(out).toContain("(CA$349.99)");
  });
});

describe("stripForbiddenOrderCurrencyLines", () => {
  it("removes lines with US$ / USD / conversion — does not rewrite", () => {
    const out = stripForbiddenOrderCurrencyLines(
      "Nice pick.\nPrice estimate: approximately US$349.99 (USD).\nConverted to CA$16.00.\nDone.",
    );
    expect(out).not.toMatch(/US\$|USD|Converted/i);
    expect(out).toContain("Nice pick.");
    expect(out).toContain("Done.");
  });
});

describe("stripChatPriceBlocks", () => {
  it("strips conversion blocks", () => {
    expect(stripChatPriceBlocks("Hi\nIf you approve, saved as CA$100")).toBe("Hi");
  });
});

describe("sanitizeOrderConfirmationReply", () => {
  it("removes USD markers and Price estimate label from grocery confirmations", () => {
    const out = sanitizeOrderConfirmationReply(
      "Order sent.\n\nPrice estimate: approximately US$160.00 (USD).",
    );
    expect(out).not.toMatch(/US\$|USD|\(USD\)|Price estimate/i);
    expect(out).toContain("Order sent.");
  });
});
