import { describe, expect, it } from "vitest";
import { buildFoodBedtimeSuggestion } from "@/lib/boredom-schedule";
import { applyScheduleReplyOutcome } from "@/lib/chat-schedule-reply";
import { getFoodCutoffClock, getZonedClock, resolveBedtimeClock } from "@/lib/boredom-schedule";
import { EVENING_PLAN_TIMEZONE } from "@/lib/boredom-schedule";

function sampleFoodBedtime() {
  const now = getZonedClock(new Date("2026-05-20T23:00:00.000Z"), EVENING_PLAN_TIMEZONE);
  const bedtime = resolveBedtimeClock(now);
  const foodCutoff = getFoodCutoffClock(bedtime);
  return { bedtime, foodCutoff };
}

describe("applyScheduleReplyOutcome", () => {
  it("does not append sleep advice on grocery list / order turns", () => {
    const groceryReply =
      "Here's a grocery list for the week:\n\n" +
      "- Spinach\n- Eggs\n\n" +
      "Estimated grocery total: CA$42.00\n\n" +
      "Shall I go ahead and create a pending grocery order for you?";

    const out = applyScheduleReplyOutcome(groceryReply, {
      committed: [],
      pendingApproval: [],
      removedFood: [],
      userMessage: "Can you suggest a grocery list for Whole Foods?",
      foodBedtime: sampleFoodBedtime(),
    });

    expect(out).not.toMatch(/healthier sleep/i);
    expect(out).not.toMatch(/7:00\s*p\.?m\./i);
    expect(out).toContain("Shall I go ahead and create a pending grocery order");
  });

  it("still appends food/bedtime notice for scheduling dinner requests", () => {
    const { bedtime, foodCutoff } = sampleFoodBedtime();
    const notice = buildFoodBedtimeSuggestion(bedtime, foodCutoff);

    const out = applyScheduleReplyOutcome("I can add dinner to your evening plan.", {
      committed: [],
      pendingApproval: [],
      removedFood: [],
      userMessage: "Schedule dinner at 8:30 tonight",
      foodBedtime: { bedtime, foodCutoff },
    });

    expect(out).toContain(notice.slice(0, 30));
  });
});
