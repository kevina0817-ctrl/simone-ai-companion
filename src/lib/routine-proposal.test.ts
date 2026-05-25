import { describe, expect, it } from "vitest";
import {
  buildRoutineProposalChatMessage,
  createRoutineProposal,
  textContainsClockTimes,
} from "@/lib/routine-proposal";
import {
  buildPhase2RoutineFromProposal,
  buildTiredEveningRoutineProposal,
} from "@/lib/routine-proposal-flow";
import { verifyProposedRoutineChatAlignment } from "@/lib/proposed-routine";
import { proposedRoutineToScheduleItems } from "@/lib/proposed-routine";
import { EVENING_PLAN_TIMEZONE } from "@/lib/boredom-schedule";
import { formatRoutineInstant } from "@/lib/proposed-routine";

describe("routine-proposal two-phase flow", () => {
  it("phase-1 proposal copy has no clock times", () => {
    const proposal = buildTiredEveningRoutineProposal();
    const message = buildRoutineProposalChatMessage(proposal);
    expect(textContainsClockTimes(message)).toBe(false);
    expect(message).toContain("Rest and Relax");
    expect(message).toContain("Would you like me to schedule this for tonight?");
    expect(proposal.exactTimesGenerated).toBe(false);
  });

  it("phase-2 generates aligned chat and approval times after confirm", () => {
    const proposal = createRoutineProposal([
      "Rest and Relax",
      "Light Stretching or Breathing",
      "Early Bedtime Preparation",
    ]);
    const nowIso = "2026-05-21T00:00:00.000Z";
    const { resolved, reply } = buildPhase2RoutineFromProposal(proposal, {
      userMessage: "sure",
      nowIso,
      todayEvents: [],
    });

    expect(resolved.proposedRoutine).toBeDefined();
    expect(textContainsClockTimes(reply)).toBe(true);

    const routine = resolved.proposedRoutine!;
    const approvals = proposedRoutineToScheduleItems(routine);
    expect(approvals.length).toBe(3);

    const alignment = verifyProposedRoutineChatAlignment(reply, routine);
    expect(alignment.ok).toBe(true);

    const firstStart = formatRoutineInstant(approvals[0]!.start_time, EVENING_PLAN_TIMEZONE);
    expect(firstStart).toMatch(/8:00/i);
  });
});
