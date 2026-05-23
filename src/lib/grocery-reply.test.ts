import { describe, expect, it } from "vitest";
import { stripGroceryTotalFromReply } from "@/lib/format-currency";
import { isGroceryOrderConfirmTurn, isInitialGroceryProposalTurn } from "@/lib/chat-intent";

describe("grocery proposal reply", () => {
  it("detects initial grocery proposal turns", () => {
    expect(isInitialGroceryProposalTurn("What groceries should I get this week?")).toBe(true);
    expect(isGroceryOrderConfirmTurn("Yes, create the pending grocery order")).toBe(true);
    expect(isInitialGroceryProposalTurn("Yes, create the pending grocery order")).toBe(false);
  });

  it("strips total estimated price headings", () => {
    const text =
      "- Spinach — CA$4.50\n- Eggs — CA$6.00\n\n### Total Estimated Price: CA$76.60\n\nShall I create the order?";
    const out = stripGroceryTotalFromReply(text);
    expect(out).not.toMatch(/Total Estimated Price/i);
    expect(out).toContain("CA$4.50");
    expect(out).toContain("Shall I create the order?");
  });
});
