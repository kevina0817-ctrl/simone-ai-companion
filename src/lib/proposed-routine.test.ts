import { describe, expect, it } from "vitest";
import {
  EVENING_PLAN_TIMEZONE,
  zonedWallTimeToInstant,
} from "@/lib/boredom-schedule";
import {
  buildDeterministicRoutineReply,
  buildProposedRoutine,
  formatRoutineActivityLine,
  formatRoutineInstant,
  proposedRoutineToScheduleItems,
  stripStructuredScheduleLinesFromReply,
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
    const chat = buildDeterministicRoutineReply(routine, null, { approvalsNote: false });

    expect(chat).toContain("Light stretching");
    expect(chat).toContain(formatRoutineInstant(start, timeZone));
    expect(chat).toContain(formatRoutineInstant(end, timeZone));

    const line = formatRoutineActivityLine(routine.activities[0]!, timeZone);
    expect(chat).toContain(line);

    expect(approvalItems[0]!.start_time).toBe(routine.activities[0]!.startTime);
    expect(approvalItems[0]!.title).toBe("Light stretching");

    const alignment = verifyProposedRoutineChatAlignment(chat, routine);
    expect(alignment.ok).toBe(true);
    expect(alignment.mismatches).toHaveLength(0);
  });

  it("replaces LLM hallucinated time ranges with canonical routine times", () => {
    const timeZone = EVENING_PLAN_TIMEZONE;
    const activities = [
      {
        start: zonedWallTimeToInstant(2026, 5, 20, 20, 0, 0, timeZone).toISOString(),
        end: zonedWallTimeToInstant(2026, 5, 20, 21, 0, 0, timeZone).toISOString(),
        title: "Gentle Relaxation",
      },
      {
        start: zonedWallTimeToInstant(2026, 5, 20, 21, 0, 0, timeZone).toISOString(),
        end: zonedWallTimeToInstant(2026, 5, 20, 21, 30, 0, timeZone).toISOString(),
        title: "Mindful Breathing or Meditation",
      },
      {
        start: zonedWallTimeToInstant(2026, 5, 20, 21, 30, 0, timeZone).toISOString(),
        end: zonedWallTimeToInstant(2026, 5, 20, 22, 0, 0, timeZone).toISOString(),
        title: "Prepare for Bed",
      },
    ];

    const items: ScheduleItem[] = activities.map((a, i) => ({
      id: `t-${i}`,
      title: a.title,
      subtitle: null,
      start_time: a.start,
      end_time: a.end,
      level: "Low" as const,
      time_zone: timeZone,
    }));

    const routine = buildProposedRoutine(items, { timeZone, requiresApproval: true });
    const llmDraft = [
      "Here's a calming plan:",
      "4:00 PM - 5:00 PM",
      "5:00 PM - 5:30 PM",
      "5:30 PM - 6:00 PM",
    ].join("\n");

    expect(stripStructuredScheduleLinesFromReply(llmDraft)).not.toMatch(/4:00\s*PM/i);

    const chat = buildDeterministicRoutineReply(routine, llmDraft, { approvalsNote: false });
    expect(chat).not.toMatch(/4:00\s*PM/i);
    expect(chat).toContain("Gentle Relaxation: 8:00 p.m. - 9:00 p.m.");
    expect(chat).toContain("Prepare for Bed: 9:30 p.m. - 10:00 p.m.");

    const approvalItems = proposedRoutineToScheduleItems(routine);
    expect(formatRoutineInstant(approvalItems[0]!.start_time, timeZone)).toMatch(/8:00/i);
    expect(verifyProposedRoutineChatAlignment(chat, routine).ok).toBe(true);
  });
});
