import { describe, expect, it } from "vitest";
import {
  applyChatCurrencyToReply,
  formatChatOrderPriceSummary,
} from "@/lib/chat-order-currency";
import {
  formatCurrencyByCategory,
  normalizeCurrencyInReplyForOrder,
  stripChatPriceBlocks,
  toBudgetCadAmount,
} from "@/lib/format-currency-by-category";
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
    amountCurrency: "CAD",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("formatCurrencyByCategory", () => {
  it("formats grocery as CAD only", () => {
    expect(formatCurrencyByCategory("grocery", 128.5, "CAD")).toBe("CA$128.50");
    expect(formatCurrencyByCategory("grocery", 128.5, "USD")).toBe("CA$128.50");
  });

  it("formats amazon as CAD only", () => {
    expect(formatCurrencyByCategory("amazon", 349.99, "USD")).toBe("CA$349.99");
  });

  it("formats luxury/other as USD only", () => {
    expect(formatCurrencyByCategory("other", 2700, "USD")).toBe("US$2,700.00");
  });

  it("converts to CAD for budget silently", () => {
    expect(toBudgetCadAmount(100, "USD")).toBe(136);
    expect(toBudgetCadAmount(128.5, "CAD")).toBe(128.5);
  });
});

describe("applyChatCurrencyToReply", () => {
  it("rewrites grocery US$ labels to CA$ and appends one summary", () => {
    const order = sampleOrder({});
    const reply = applyChatCurrencyToReply(
      "Your list looks good. Estimated total: US$128.50 (USD).",
      [order],
    );
    expect(reply).not.toMatch(/US\$|USD/i);
    expect(reply).toContain("CA$128.50");
    expect(reply).toContain("Estimated grocery total: CA$128.50");
    const summaryCount = (reply.match(/Estimated grocery total/g) ?? []).length;
    expect(summaryCount).toBe(1);
  });

  it("luxury reply shows USD only and strips CAD conversion copy", () => {
    const order = sampleOrder({
      title: "Louis Vuitton Neverfull",
      store: "Louis Vuitton",
      category: "other",
      totalEstimatedPrice: 2700,
      amountCurrency: "USD",
    });
    const messy =
      "Price estimate: approximately CAD 2,700.00.\n" +
      "Price estimate: approximately US$2700.00.\n" +
      "US$2700.00 → CA$3672.00\n" +
      "If you approve, it will be saved as about CA$3672.00 after conversion.";
    const reply = applyChatCurrencyToReply(messy, [order]);
    expect(reply).toMatch(/US\$2,700\.00/);
    expect(reply).not.toMatch(/CA\$3,?672/);
    expect(reply).not.toMatch(/→/);
    expect(reply).not.toMatch(/after conversion/i);
    expect((reply.match(/Price estimate/g) ?? []).length).toBe(1);
  });

  it("amazon uses CAD only in summary", () => {
    const order = sampleOrder({
      category: "amazon",
      store: "Amazon",
      title: "AirPods",
      totalEstimatedPrice: 349.99,
      amountCurrency: "CAD",
    });
    const summary = formatChatOrderPriceSummary(order);
    expect(summary).toBe("Price estimate: CA$349.99");
    expect(summary).not.toMatch(/US\$|USD/i);
  });
});

describe("stripChatPriceBlocks", () => {
  it("removes duplicate price lines before re-append", () => {
    const cleaned = stripChatPriceBlocks(
      "Intro\nPrice estimate: US$100\nIf you approve, saved as CA$136",
    );
    expect(cleaned).toBe("Intro");
  });
});

describe("normalizeCurrencyInReplyForOrder", () => {
  it("normalizes inline amazon amounts", () => {
    const out = normalizeCurrencyInReplyForOrder(
      "About US$349.99 on Amazon.",
      "amazon",
      { totalEstimatedPrice: 349.99, items: [{ estimatedPrice: 349.99, qty: 1 }] },
      "CAD",
    );
    expect(out).toContain("CA$349.99");
    expect(out).not.toMatch(/US\$/);
  });
});
