import { coerceEventToToday, isSameCalendarDay, type ScheduleItem } from "@/lib/schedule-item";
import type { ScheduleContextEvent } from "@/lib/schedule-context";

const BOREDOM_INTENT =
  /\b(?:i\s*(?:'m|am)|feeling)\s+bored\b|\bi\s+feel\s+bored\b|\b(?:i\s*)?bored\b.*\b(?:what|something|activities?|plan|do)\b|\bwhat\s+should\s+i\s+do(?:\s+now|\s+tonight)?\b|\bhelp\s+me\s+plan\s+(?:the\s+)?rest\s+of\s+(?:my\s+)?tonight\b|\bsomething\s+to\s+do\s+(?:now|tonight)\b|\b(?:have|got)\s+nothing\s+to\s+do\b|\bkill\s+time\b|\bneed\s+(?:something|ideas?)\s+to\s+do\b/i;

const TOMORROW_EXPLICIT =
  /\b(?:tomorrow|next\s+day|the\s+morning)\b/i;

const TONIGHT_HINT = /\b(?:tonight|this\s+evening|rest\s+of\s+(?:my\s+)?(?:day|night)|right\s+now|now)\b/i;

const BEDTIME_EVENT =
  /\b(?:bedtime|sleep\s+prep|wind-?down|lights\s+out|prepare\s+for\s+bed)\b/i;

const DEFAULT_BEDTIME = { hour: 22, minute: 30 };

/** User wants activities because they are bored or need something to do now/tonight. */
export function isBoredomOrFreeTimeIntent(userMessage: string): boolean {
  const t = userMessage.trim();
  if (!t) return false;
  return BOREDOM_INTENT.test(t);
}

/** Only skip tonight planning when the user clearly asked for a future day. */
export function userExplicitlyWantsTomorrow(userMessage: string): boolean {
  const t = userMessage.trim();
  if (!t || !TOMORROW_EXPLICIT.test(t)) return false;
  if (TONIGHT_HINT.test(t) && /\brest\s+of\s+tonight\b/i.test(t)) return false;
  return true;
}

/** Round up to the next quarter-hour (7:05 → 7:15; 7:15 → 7:15; 7:16 → 7:30). */
export function roundUpToNextQuarterHour(ref: Date): Date {
  const d = new Date(ref);
  const hasSubMinute = d.getSeconds() > 0 || d.getMilliseconds() > 0;
  d.setSeconds(0, 0);
  const totalMins = d.getHours() * 60 + d.getMinutes();
  const bump = hasSubMinute ? 1 : 0;
  const ceiled = Math.ceil((totalMins + bump) / 15) * 15;
  d.setHours(Math.floor(ceiled / 60), ceiled % 60, 0, 0);
  return d;
}

function parseLightsOutFromText(text: string, ref: Date): Date | null {
  const m = text.match(
    /lights?\s+out\s+by\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
  );
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!meridiem && hour >= 1 && hour <= 11) hour += 12;
  const out = new Date(ref);
  out.setHours(hour, minute, 0, 0);
  return out;
}

/** Bedtime from today's schedule (sleep/bedtime events) or a sensible default. */
export function inferBedtime(
  todayEvents: Array<{ title: string; subtitle?: string | null; start_time: string; end_time?: string }>,
  ref = new Date(),
): Date {
  let latest: Date | null = null;

  for (const ev of todayEvents) {
    const text = `${ev.title} ${ev.subtitle ?? ""}`;
    if (!BEDTIME_EVENT.test(text)) continue;
    const lightsOut = parseLightsOutFromText(text, ref);
    const start = new Date(ev.start_time);
    if (!isSameCalendarDay(ev.start_time, ref)) continue;

    const candidate =
      lightsOut ??
      (ev.end_time
        ? new Date(ev.end_time)
        : new Date(start.getTime() + 45 * 60 * 1000));

    if (!latest || candidate > latest) latest = candidate;
  }

  if (latest && latest > ref) return latest;

  const fallback = new Date(ref);
  fallback.setHours(DEFAULT_BEDTIME.hour, DEFAULT_BEDTIME.minute, 0, 0);
  if (fallback <= ref) {
    fallback.setHours(23, 30, 0, 0);
  }
  return fallback;
}

function eventDurationMs(ev: ScheduleItem): number {
  const start = new Date(ev.start_time);
  const end = ev.end_time ? new Date(ev.end_time) : new Date(start.getTime() + 45 * 60 * 1000);
  const ms = end.getTime() - start.getTime();
  return Math.max(15 * 60 * 1000, Number.isFinite(ms) ? ms : 45 * 60 * 1000);
}

function setLocalTimeOnDay(iso: string, clock: Date, ref: Date): string {
  const base = coerceEventToToday(iso, ref);
  const d = new Date(base);
  d.setHours(clock.getHours(), clock.getMinutes(), 0, 0);
  return d.toISOString();
}

/**
 * Re-map planned activities to tonight: quarter-hour start through bedtime, all on today's date.
 */
export function coerceBoredomScheduleEvents(
  events: ScheduleItem[],
  opts: { now?: Date; bedtime?: Date; todayEvents?: ScheduleItem[] },
): ScheduleItem[] {
  const now = opts.now ?? new Date();
  const bedtime =
    opts.bedtime ?? inferBedtime(opts.todayEvents ?? [], now);
  let cursor = roundUpToNextQuarterHour(now);
  if (cursor.getTime() < now.getTime()) {
    cursor = new Date(cursor.getTime() + 15 * 60 * 1000);
  }

  const sorted = [...events].sort(
    (a, b) => +new Date(a.start_time) - +new Date(b.start_time),
  );
  const result: ScheduleItem[] = [];

  for (const ev of sorted) {
    if (cursor >= bedtime) break;

    const durationMs = eventDurationMs(ev);
    const start = new Date(now);
    start.setHours(cursor.getHours(), cursor.getMinutes(), 0, 0);

    let end = new Date(start.getTime() + durationMs);
    if (end > bedtime) end = new Date(bedtime);

    if (start >= bedtime) break;

    result.push({
      ...ev,
      start_time: setLocalTimeOnDay(ev.start_time, start, now),
      end_time: setLocalTimeOnDay(ev.end_time ?? ev.start_time, end, now),
    });

    cursor = new Date(end);
  }

  return result;
}

export function formatLocalTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

export function buildBoredomPlanningContextBlock(opts: {
  nowIso: string;
  events: ScheduleContextEvent[];
}): string {
  const now = new Date(opts.nowIso);
  const bedtime = inferBedtime(opts.events, now);
  const planStart = roundUpToNextQuarterHour(now);
  const todayDate = now.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return [
    "BOREDOM / FREE-TIME PLANNING (mandatory for this message):",
    `- Plan ONLY for ${todayDate} (today). Do NOT use tomorrow's date unless the user explicitly asked for tomorrow.`,
    `- First activity starts at ${formatLocalTime(planStart)} (next quarter-hour from now).`,
    `- Last activity must end by bedtime ${formatLocalTime(bedtime)}.`,
    "- Space activities sequentially from that start time until bedtime.",
    "- Call schedule_event once per activity with start_time and end_time as ISO datetimes on TODAY's calendar date.",
    "- Do not schedule before the quarter-hour start or after bedtime.",
  ].join("\n");
}
