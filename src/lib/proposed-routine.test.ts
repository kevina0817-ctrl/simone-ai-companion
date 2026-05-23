import { describe, expect, it } from "vitest";
import {
  EVENING_PLAN_TIMEZONE,
  zonedWallTimeToInstant,
} from "@/lib/boredom-schedule";
import {
  buildProposedRoutine,
  formatRoutineActivityLine,
  formatRoutineInstant,
  mergeChatReplyWithProposedRoutine,
  proposedRoutineToScheduleItems,
  verifyProposedRoutineChatAlignment,
} from "@/lib/proposed-routine";
import type { ScheduleItem } from "@/lib/schedule-item";

describe("proposed-routine", () => {
  it("chat lines match approval start times for bedtime routine", () => {
    const timeZone = EVENING_PLAN_TIMEZONE;
    const start = zonedWallTimeToInstant(2026, 5, 20, 21, 30, 0, timeZone).toISOString();
    const end = zonedWallTimeToInstant(2026, 5, 20, 21, 45, 0, timeZone).toISOString();

    const items: ScheduleItem[] = [
      {
        id: "test-1",
        title: "Light stretching",
        subtitle: "Gentle mobility",
        start_time: start,
        end_time: end,
        level: "Low",
        time_zone: timeZone,
      },
    ];

    const routine = buildProposedRoutine(items, { timeZone, requiresApproval: true });
    const approvalItems = proposedRoutineToScheduleItems(routine);
    const chat = mergeChatReplyWithProposedRoutine("", routine, { approvalsNote: false });

    expect(chat).toContain("Light stretching");
    expect(chat).toContain(formatRoutineInstant(start, timeZone));

    const line = formatRoutineActivityLine(routine.activities[0]!, timeZone);
    expect(chat).toContain(line);

    expect(approvalItems[0]!.start_time).toBe(routine.activities[0]!.startTime);
    expect(approvalItems[0]!.title).toBe("Light stretching");

    const alignment = verifyProposedRoutineChatAlignment(chat, routine);
    expect(alignment.ok).toBe(true);
    expect(alignment.mismatches).toHaveLength(0);
  });
});
