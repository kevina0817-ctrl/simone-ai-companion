import { describe, expect, it } from "vitest";
import { applyChatCurrencyToReply, formatChatOrderPriceSummary } from "@/lib/chat-order-currency";
import { formatCurrency, normalizeCurrencyInText, stripChatPriceBlocks } from "@/lib/format-currency";
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
  it("formats amounts as CA$", () => {
    expect(formatCurrency(2700)).toBe("CA$2,700.00");
    expect(formatCurrency(128.5)).toBe("CA$128.50");
  });
});

describe("applyChatCurrencyToReply", () => {
  it("grocery proposal strips total; confirm turn shows estimated total", () => {
    const order = sampleOrder({});
    const proposal = applyChatCurrencyToReply(
      "### Total Estimated Price: CA$128.50\n\nShall I create the order?",
      [],
      { userMessage: "Suggest a grocery list for Whole Foods" },
    );
    expect(proposal).not.toMatch(/Total Estimated Price/i);
    expect(proposal).not.toMatch(/Estimated grocery total/i);

    const confirmed = applyChatCurrencyToReply("Creating your pending grocery order.", [order], {
      userMessage: "Yes, create the pending grocery order",
    });
    expect(confirmed).toContain("Estimated grocery total: CA$128.50");
  });

  it("LV reply shows single CA$ price only", () => {
    const order = sampleOrder({
      title: "Louis Vuitton Neverfull",
      store: "Louis Vuitton",
      category: "other",
      totalEstimatedPrice: 2700,
    });
    const messy =
      "Price estimate: approximately CAD 2,700.00.\n" +
      "Price estimate: approximately US$2700.00.\n" +
      "US$2700.00 → CA$3672.00\n" +
      "If you approve, it will be saved as about CA$3672.00 after conversion.";
    const reply = applyChatCurrencyToReply(messy, [order]);
    expect(reply).toContain("CA$2,700.00");
    expect(reply).not.toMatch(/US\$|USD/i);
    expect(reply).not.toMatch(/→/);
    expect(reply).not.toMatch(/after conversion/i);
    expect((reply.match(/Price estimate/g) ?? []).length).toBe(1);
  });

  it("amazon summary uses CA$ only", () => {
    const order = sampleOrder({
      category: "amazon",
      store: "Amazon",
      title: "AirPods",
      totalEstimatedPrice: 349.99,
    });
    expect(formatChatOrderPriceSummary(order)).toBe("Price estimate: CA$349.99");
  });
});

describe("normalizeCurrencyInText", () => {
  it("strips conversion blocks", () => {
    expect(stripChatPriceBlocks("Hi\nIf you approve, saved as CA$100")).toBe("Hi");
  });

  it("normalizes inline amounts", () => {
    const out = normalizeCurrencyInText("About US$349.99 on Amazon.", [349.99]);
    expect(out).toContain("CA$349.99");
    expect(out).not.toMatch(/US\$/);
  });
});
