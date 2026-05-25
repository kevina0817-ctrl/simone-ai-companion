import {
  EVENING_PLAN_TIMEZONE,
  formatZonedTime,
  getZonedClock,
  zonedWallTimeToInstant,
} from "@/lib/boredom-schedule";
import { generateScheduleId, type ScheduleItem, type ScheduleLevel } from "@/lib/schedule-item";

export type RoutineActivity = {
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  category: string;
  requiresApproval: boolean;
  level: ScheduleLevel;
};

export type ProposedRoutine = {
  activities: RoutineActivity[];
  timeZone: string;
};

function inferRoutineCategory(title: string, subtitle: string | null): string {
  const text = `${title} ${subtitle ?? ""}`.toLowerCase();
  if (/\b(stretch|yoga|pilates|walk|breathwork)\b/.test(text)) return "Movement";
  if (/\b(read|journal|meditat|mindful)\b/.test(text)) return "Mindfulness";
  if (/\b(skincare|bath|spa)\b/.test(text)) return "Self-care";
  if (/\b(music|listen|relax)\b/.test(text)) return "Relaxation";
  if (/\b(prep|tomorrow|pack)\b/.test(text)) return "Planning";
  return "Wind-down";
}

export function formatRoutineInstant(
  iso: string,
  timeZone: string = EVENING_PLAN_TIMEZONE,
): string {
  return formatZonedTime(getZonedClock(new Date(iso), timeZone));
}

/** Chat line: "Light stretching: 9:30 PM - 10:00 PM" */
export function formatRoutineActivityLine(
  activity: RoutineActivity,
  timeZone: string = EVENING_PLAN_TIMEZONE,
): string {
  const start = formatRoutineInstant(activity.startTime, timeZone);
  const end = formatRoutineInstant(activity.endTime, timeZone);
  return `${activity.title}: ${start} - ${end}`;
}

export function formatProposedRoutineChatBlock(routine: ProposedRoutine): string {
  const lines = routine.activities.map((a) => formatRoutineActivityLine(a, routine.timeZone));
  return lines.join("\n");
}

/** JSON-friendly copy for model context — exact times only. */
export function formatRoutineEventsForModelContext(routine: ProposedRoutine): string {
  return JSON.stringify(
    routine.activities.map((a) => ({
      title: a.title,
      description: a.description,
      startTime: formatRoutineInstant(a.startTime, routine.timeZone),
      endTime: formatRoutineInstant(a.endTime, routine.timeZone),
      category: a.category,
      requiresApproval: a.requiresApproval,
    })),
    null,
    2,
  );
}

export function buildProposedRoutine(
  items: ScheduleItem[],
  opts: { timeZone?: string; requiresApproval?: boolean },
): ProposedRoutine {
  const timeZone = opts.timeZone ?? EVENING_PLAN_TIMEZONE;
  const requiresApproval = opts.requiresApproval ?? true;
  const sorted = [...items].sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time));

  const activities: RoutineActivity[] = sorted.map((item) => {
    const startTime = new Date(item.start_time).toISOString();
    const endTime = item.end_time
      ? new Date(item.end_time).toISOString()
      : new Date(new Date(startTime).getTime() + 30 * 60_000).toISOString();

    return {
      title: item.title,
      description: item.subtitle,
      startTime,
      endTime,
      category: inferRoutineCategory(item.title, item.subtitle),
      requiresApproval,
      level: item.level,
    };
  });

  return { activities, timeZone };
}

export function proposedRoutineToScheduleItems(routine: ProposedRoutine): ScheduleItem[] {
  return routine.activities.map((a) => ({
    id: generateScheduleId(),
    title: a.title,
    subtitle: a.description,
    start_time: a.startTime,
    end_time: a.endTime,
    level: a.level,
    time_zone: routine.timeZone,
  }));
}

const STRUCTURED_SCHEDULE_LINE =
  /^(?:[-*•]\s+)?(?:\d+[.)]\s+)?(.+?)\s*[—–-]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*$/i;

const TIME_DASH_TITLE_LINE =
  /^(?:[-*•]\s+)?(?:\d+[.)]\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[-–—]\s*(.+)$/i;

const TIME_RANGE_ONLY_LINE =
  /^(?:[-*•]\s+)?(?:\d+[.)]\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–—]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*$/i;

const TITLE_COLON_TIME_RANGE_LINE =
  /^(?:[-*•]\s+)?(?:\d+[.)]\s+)?[^:]+:\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–—]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*$/i;

function isScheduleTimeLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  return (
    STRUCTURED_SCHEDULE_LINE.test(t) ||
    TIME_DASH_TITLE_LINE.test(t) ||
    TIME_RANGE_ONLY_LINE.test(t) ||
    TITLE_COLON_TIME_RANGE_LINE.test(t)
  );
}

/** Remove LLM-invented schedule/time lines from prose (keep intro only). */
export function stripStructuredScheduleLinesFromReply(text: string): string {
  const kept: string[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      kept.push(rawLine);
      continue;
    }
    if (isScheduleTimeLine(line)) continue;
    kept.push(rawLine);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function mergeChatReplyWithProposedRoutine(
  reply: string,
  routine: ProposedRoutine,
  opts?: { approvalsNote?: boolean },
): string {
  return buildDeterministicRoutineReply(routine, reply, opts);
}

/**
 * Canonical chat copy for a bedtime routine — never use LLM-invented times.
 */
export function buildDeterministicRoutineReply(
  routine: ProposedRoutine,
  llmIntro?: string | null,
  opts?: { approvalsNote?: boolean },
): string {
  const intro = llmIntro ? stripStructuredScheduleLinesFromReply(llmIntro) : "";
  const block = formatProposedRoutineChatBlock(routine);
  const note =
    opts?.approvalsNote !== false && routine.activities.some((a) => a.requiresApproval)
      ? "\n\nI've added these to your Approvals — confirm each one to place them on today's schedule."
      : "";

  const header =
    intro.trim() ||
    "Here's your wind-down routine before bed (America/Toronto times):";

  return `${header}\n\n${block}${note}`.trim();
}

/** Validate chat copy; replace entire schedule section if times do not match routine. */
export function enforceRoutineTimesInReply(reply: string, routine: ProposedRoutine): string {
  const check = verifyProposedRoutineChatAlignment(reply, routine);
  if (check.ok) {
    const block = formatProposedRoutineChatBlock(routine);
    if (reply.includes(block)) return reply;
  }
  if (import.meta.env?.DEV && !check.ok) {
    console.warn("[proposed-routine] replacing mismatched schedule copy", check.mismatches);
  }
  return buildDeterministicRoutineReply(routine, reply);
}

export type RoutineAlignmentCheck = {
  ok: boolean;
  mismatches: { title: string; expectedLine: string; foundTime: boolean; foundTitle: boolean }[];
};

/** Dev/test helper — chat lines must match approval event times. */
export function verifyProposedRoutineChatAlignment(
  chatText: string,
  routine: ProposedRoutine,
): RoutineAlignmentCheck {
  const mismatches: RoutineAlignmentCheck["mismatches"] = [];

  for (const activity of routine.activities) {
    const expectedLine = formatRoutineActivityLine(activity, routine.timeZone);
    const startLabel = formatRoutineInstant(activity.startTime, routine.timeZone);
    const endLabel = formatRoutineInstant(activity.endTime, routine.timeZone);
    const foundTime = chatText.includes(startLabel) && chatText.includes(endLabel);
    const foundTitle = chatText.includes(activity.title);
    if (!foundTime || !foundTitle) {
      mismatches.push({
        title: activity.title,
        expectedLine,
        foundTime,
        foundTitle,
      });
    }
  }

  const result = { ok: mismatches.length === 0, mismatches };

  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    console.log("[proposed-routine] alignment", {
      ok: result.ok,
      activities: routine.activities.map((a) => ({
        line: formatRoutineActivityLine(a, routine.timeZone),
        startTime: a.startTime,
        endTime: a.endTime,
      })),
      mismatches: result.mismatches,
    });
  }

  return result;
}

/** Lightweight self-check (run in dev tools or future test runner). */
export function runProposedRoutineAlignmentSelfCheck(): boolean {
  const timeZone = EVENING_PLAN_TIMEZONE;
  const start = zonedWallTimeToInstant(2026, 5, 20, 21, 30, 0, timeZone).toISOString();
  const end = zonedWallTimeToInstant(2026, 5, 20, 21, 50, 0, timeZone).toISOString();

  const items: ScheduleItem[] = [
    {
      id: "t1",
      title: "Light stretching",
      subtitle: "Gentle mobility",
      start_time: start,
      end_time: end,
      level: "Low",
      time_zone: timeZone,
    },
  ];
  const routine = buildProposedRoutine(items, { timeZone, requiresApproval: true });
  const chat = mergeChatReplyWithProposedRoutine("", routine, { approvalsNote: false });
  const check = verifyProposedRoutineChatAlignment(chat, routine);
  if (!check.ok) {
    console.error("[proposed-routine] self-check failed", check);
  }
  return check.ok;
}
