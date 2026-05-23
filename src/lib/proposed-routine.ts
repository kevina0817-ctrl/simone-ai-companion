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

/** Chat line: "9:30 PM - Light stretching" */
export function formatRoutineActivityLine(
  activity: RoutineActivity,
  timeZone: string = EVENING_PLAN_TIMEZONE,
): string {
  return `${formatRoutineInstant(activity.startTime, timeZone)} - ${activity.title}`;
}

export function formatProposedRoutineChatBlock(routine: ProposedRoutine): string {
  const lines = routine.activities.map((a) => formatRoutineActivityLine(a, routine.timeZone));
  return lines.join("\n");
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

/** Remove duplicate schedule lines from the model reply before injecting the canonical routine block. */
export function stripStructuredScheduleLinesFromReply(text: string): string {
  const kept: string[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      kept.push(rawLine);
      continue;
    }
    if (STRUCTURED_SCHEDULE_LINE.test(line) || TIME_DASH_TITLE_LINE.test(line)) {
      continue;
    }
    kept.push(rawLine);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function mergeChatReplyWithProposedRoutine(
  reply: string,
  routine: ProposedRoutine,
  opts?: { approvalsNote?: boolean },
): string {
  const intro = stripStructuredScheduleLinesFromReply(reply);
  const block = formatProposedRoutineChatBlock(routine);
  const note =
    opts?.approvalsNote !== false && routine.activities.some((a) => a.requiresApproval)
      ? "\n\nI've added these to your Approvals — confirm each one to place them on today's schedule."
      : "";

  if (!intro) {
    return `Here's your wind-down routine:\n\n${block}${note}`;
  }
  return `${intro}\n\n${block}${note}`;
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
    const timeLabel = formatRoutineInstant(activity.startTime, routine.timeZone);
    const foundTime = chatText.includes(timeLabel);
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
