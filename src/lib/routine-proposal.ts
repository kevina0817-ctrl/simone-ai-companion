import { EVENING_PLAN_TIMEZONE } from "@/lib/boredom-schedule";

export type RoutineProposalIntent = "tired_evening_routine";

export type RoutineProposalTimeMode = "from_now_until_bedtime";

/** Flexible routine — no exact clock times until user confirms. */
export type RoutineProposal = {
  intent: RoutineProposalIntent;
  requiresApproval: true;
  activities: string[];
  timeMode: RoutineProposalTimeMode;
  exactTimesGenerated: false;
  createdAt: string;
};

const CLOCK_TIME_IN_TEXT =
  /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|am|pm)\b|\b\d{1,2}:\d{2}\b/i;

const DEFAULT_TIRED_ACTIVITIES = [
  "Rest and Relax",
  "Light Stretching or Breathing",
  "Early Bedtime Preparation",
];

const BULLET_ACTIVITY = /^(?:[-*•]\s+|\d+[.)]\s+)(.+)$/;

/** True if text contains clock times (must not appear in phase-1 proposal copy). */
export function textContainsClockTimes(text: string): boolean {
  return CLOCK_TIME_IN_TEXT.test(text);
}

/** Parse activity titles from a bullet list — ignores lines that look like times. */
export function parseActivityNamesFromProposalReply(text: string): string[] {
  const names: string[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (textContainsClockTimes(line) && !BULLET_ACTIVITY.test(line)) continue;

    const bullet = line.match(BULLET_ACTIVITY);
    const candidate = (bullet?.[1] ?? line).trim();
    if (!candidate || candidate.length < 2) continue;
    if (textContainsClockTimes(candidate)) continue;
    if (/^would you like/i.test(candidate)) continue;

    names.push(candidate.replace(/\*\*/g, "").slice(0, 120));
  }

  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  return unique.length >= 2 ? unique : [...DEFAULT_TIRED_ACTIVITIES];
}

export function createRoutineProposal(
  activities: string[],
  opts?: { createdAt?: string },
): RoutineProposal {
  return {
    intent: "tired_evening_routine",
    requiresApproval: true,
    activities,
    timeMode: "from_now_until_bedtime",
    exactTimesGenerated: false,
    createdAt: opts?.createdAt ?? new Date().toISOString(),
  };
}

/** Deterministic phase-1 chat copy — no clock times. */
export function buildRoutineProposalApprovalDetail(proposal: RoutineProposal): string {
  const list = proposal.activities.map((a) => `• ${a}`).join("\n");
  return `Wind-down routine • From now until bedtime\n${list}`;
}

export function buildRoutineProposalChatMessage(proposal: RoutineProposal): string {
  const bullets = proposal.activities.map((a) => `- ${a}`).join("\n");
  return (
    "It sounds like you're exhausted, so I'll keep this light and calming. From now until bedtime, I suggest:\n\n" +
    `${bullets}\n\n` +
    "Would you like me to schedule this for tonight?"
  );
}

export function buildRoutineScheduledConfirmationMessage(
  activityLines: string[],
): string {
  return (
    "I've scheduled your wind-down routine for tonight (America/Toronto times):\n\n" +
    `${activityLines.join("\n")}\n\n` +
    "Review each item under Approvals to add them to today's schedule, or approve them all there."
  );
}

export const ROUTINE_PROPOSAL_TIMEZONE = EVENING_PLAN_TIMEZONE;
