import { formatScheduleTimeRange, type ScheduleItem } from "@/lib/schedule-item";

const APPROVAL_PHRASE =
  /\b(?:pending\s+approval|pending\s+your\s+approval|awaiting\s+(?:your\s+)?approval|once\s+you\s+confirm|when\s+you\s+confirm|after\s+you\s+confirm|until\s+you\s+confirm|(?:you(?:'ll| will)\s+)?need\s+to\s+confirm|confirmation\s+required|confirm\s+it\s+(?:in|on)\s+approvals?|(?:sent|added)\s+to\s+(?:your\s+)?approvals?(?:\s+queue)?|officially\s+added\s+(?:once|after)|will\s+be\s+officially\s+added)\b/gi;

const APPROVAL_SENTENCE =
  /[^.!?\n]*\b(?:pending\s+approval|once\s+you\s+confirm|approvals?\s+queue|confirm(?:ation)?\s+required)\b[^.!?\n]*[.!?]?/gi;

function stripScheduleApprovalPhrases(text: string): string {
  let out = text.replace(APPROVAL_SENTENCE, "").replace(APPROVAL_PHRASE, "");
  out = out.replace(/\n{3,}/g, "\n\n").replace(/\s{2,}/g, " ").trim();
  return out;
}

function buildDirectConfirmation(events: ScheduleItem[]): string {
  if (events.length === 0) return "";

  if (events.length === 1) {
    const ev = events[0]!;
    const when = formatScheduleTimeRange(ev);
    return `I've added your ${ev.title} for ${when} directly to today's schedule.`;
  }

  const titles = events.map((e) => e.title).join(", ");
  return `I've added ${events.length} events (${titles}) directly to today's schedule.`;
}

function supportiveFollowUp(eventTitle: string): string {
  const topic = eventTitle.toLowerCase();
  if (/\b(gym|workout|run|training)\b/.test(topic)) {
    return "If you'd like, I can also help you add a warm-up, cool-down, or recovery block around it.";
  }
  if (/\b(yoga|pilates|stretch)\b/.test(topic)) {
    return "If you'd like, I can suggest a complementary session or buffer time before and after.";
  }
  if (/\b(lunch|dinner|breakfast|meal)\b/.test(topic)) {
    return "If you'd like, I can help you plan the rest of your day around it.";
  }
  return "If you'd like, I can help you adjust anything else on today's schedule.";
}

/**
 * Align assistant copy with what actually happened (direct timeline vs Approvals queue).
 */
export function applyScheduleReplyOutcome(
  reply: string,
  outcome: { committed: ScheduleItem[]; pendingApproval: ScheduleItem[] },
): string {
  const trimmed = reply.trim();
  if (!trimmed) {
    if (outcome.committed.length > 0 && outcome.pendingApproval.length === 0) {
      const lead = buildDirectConfirmation(outcome.committed);
      return `${lead}\n\n${supportiveFollowUp(outcome.committed[0]!.title)}`;
    }
    return trimmed;
  }

  if (outcome.committed.length > 0 && outcome.pendingApproval.length === 0) {
    const stripped = stripScheduleApprovalPhrases(trimmed);
    const lead = buildDirectConfirmation(outcome.committed);
    const followUp = supportiveFollowUp(outcome.committed[0]!.title);

    if (stripped.length < 40 || APPROVAL_PHRASE.test(trimmed)) {
      return `${lead}\n\n${followUp}`;
    }

    if (!/\b(?:added|scheduled|booked|set up|on your schedule)\b/i.test(stripped)) {
      return `${lead}\n\n${stripped}\n\n${followUp}`;
    }

    return `${stripped}\n\n${followUp}`;
  }

  return trimmed;
}
