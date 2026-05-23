import type { ScheduleItem } from "@/lib/schedule-item";
import type { ScheduleContextEvent } from "@/lib/schedule-context";

/** Eastern Time (EST/EDT) — used for evening / boredom planning. */
export const EVENING_PLAN_TIMEZONE = "America/Toronto";

const BOREDOM_INTENT =
  /\b(?:i\s*(?:'m|am)|feeling)\s+bored\b|\bi\s+feel\s+bored\b|\b(?:i\s*)?bored\b.*\b(?:what|something|activities?|plan|do)\b|\bwhat\s+should\s+i\s+do(?:\s+now|\s+tonight)?\b|\bhelp\s+me\s+plan\s+(?:the\s+)?rest\s+of\s+(?:my\s+)?tonight\b|\bsomething\s+to\s+do\s+(?:now|tonight)\b|\b(?:have|got)\s+nothing\s+to\s+do\b|\bkill\s+time\b|\bneed\s+(?:something|ideas?)\s+to\s+do\b|\bevening\s+activit|\bactivit(?:y|ies)\s+for\s+tonight\b|\bsuggest(?:ions?)?\s+(?:for\s+)?(?:this\s+)?evening\b|\bwhat\s+to\s+do\s+tonight\b/i;

/** "From now until sleep/bedtime" and similar evening planning (not only boredom). */
const EVENING_PLAN_INTENT =
  /\b(?:help\s+me\s+plan\s+(?:my\s+)?(?:schedule|night|evening)\s+from\s+now|plan\s+(?:my\s+)?(?:schedule|night|evening)\s+from\s+now|from\s+now\s+until\s+(?:sleep|bed(?:time)?)|now\s+until\s+(?:sleep|bed(?:time)?)|until\s+(?:i\s+)?(?:sleep|bed(?:time)?)|rest\s+of\s+(?:my\s+)?(?:night|evening)|for\s+the\s+rest\s+of\s+tonight|what\s+should\s+i\s+do\s+for\s+the\s+rest\s+of\s+tonight|what\s+should\s+i\s+do\s+tonight|tonight'?s?\s+(?:plan|schedule))\b/i;

const TOMORROW_EXPLICIT =
  /\b(?:tomorrow|next\s+day|the\s+morning)\b/i;

const TONIGHT_HINT = /\b(?:tonight|this\s+evening|rest\s+of\s+(?:my\s+)?(?:day|night)|right\s+now|now)\b/i;

const LATE_EVENING_EXPLICIT =
  /\b(?:past\s+11|after\s+11(?::\d{2})?\s*pm|stay\s+up\s+late|later\s+than\s+11|midnight|12\s*:?\s*00\s*am|12\s*am|1\s*am)\b/i;

/** Healthy default — optional activities must not run past this (Toronto local). */
export const DEFAULT_BEDTIME_HOUR = 23;
export const DEFAULT_BEDTIME_MINUTE = 0;

export type ZonedClock = {
  timeZone: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function getZonedClock(
  instant: Date,
  timeZone: string = EVENING_PLAN_TIMEZONE,
): ZonedClock {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  return {
    timeZone,
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

/** Wall clock in timeZone → UTC instant. */
export function zonedWallTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string = EVENING_PLAN_TIMEZONE,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const d = new Date(utcGuess);
  const z = getZonedClock(d, timeZone);
  const asUtc = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second);
  const wantUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return new Date(utcGuess + (wantUtc - asUtc));
}

export function clockToInstant(clock: ZonedClock): Date {
  return zonedWallTimeToInstant(
    clock.year,
    clock.month,
    clock.day,
    clock.hour,
    clock.minute,
    clock.second,
    clock.timeZone,
  );
}

function totalMinutes(clock: Pick<ZonedClock, "hour" | "minute">): number {
  return clock.hour * 60 + clock.minute;
}

function withClockTime(
  base: ZonedClock,
  hour: number,
  minute: number,
  second = 0,
): ZonedClock {
  return { ...base, hour, minute, second };
}

/** User wants activities because they are bored or need something to do now/tonight. */
export function isBoredomOrFreeTimeIntent(userMessage: string): boolean {
  const t = userMessage.trim();
  if (!t) return false;
  return BOREDOM_INTENT.test(t);
}

/** Evening / tonight planning from now → bedtime (America/Toronto). */
export function isEveningPlanIntent(userMessage: string): boolean {
  const t = userMessage.trim();
  if (!t) return false;
  if (isBoredomOrFreeTimeIntent(t)) return true;
  if (EVENING_PLAN_INTENT.test(t)) return true;
  if (TONIGHT_HINT.test(t) && /\b(?:plan|schedule|activit|what\s+should\s+i\s+do)\b/i.test(t)) {
    return true;
  }
  return false;
}

function isLateNightMorningHour(hour: number): boolean {
  return hour >= 0 && hour < 6;
}

function isEveningTorontoHour(hour: number): boolean {
  return hour >= 17 && hour <= 23;
}

/** Toronto calendar-day bounds for schedule queries (not server-local midnight). */
export function getTorontoCalendarDayBounds(instant = new Date()) {
  const z = getZonedClock(instant, EVENING_PLAN_TIMEZONE);
  const start = zonedWallTimeToInstant(z.year, z.month, z.day, 0, 0, 0, EVENING_PLAN_TIMEZONE);
  const end = zonedWallTimeToInstant(z.year, z.month, z.day, 23, 59, 59, EVENING_PLAN_TIMEZONE);
  return { start, end, startIso: start.toISOString(), endIso: end.toISOString() };
}

export function userExplicitlyWantsTomorrow(userMessage: string): boolean {
  const t = userMessage.trim();
  if (!t || !TOMORROW_EXPLICIT.test(t)) return false;
  if (TONIGHT_HINT.test(t) && /\brest\s+of\s+tonight\b/i.test(t)) return false;
  return true;
}

export function userExplicitlyWantsLateEvening(userMessage: string): boolean {
  return LATE_EVENING_EXPLICIT.test(userMessage.trim());
}

/** Round up to the next quarter-hour in the given timezone (7:05 → 7:15). */
export function roundUpToNextQuarterHour(
  instant: Date,
  timeZone: string = EVENING_PLAN_TIMEZONE,
): ZonedClock {
  const z = getZonedClock(instant, timeZone);
  const hasSubMinute = z.second > 0;
  const totalMins = z.hour * 60 + z.minute;
  const bump = hasSubMinute ? 1 : 0;
  let ceiled = Math.ceil((totalMins + bump) / 15) * 15;
  if (ceiled >= 24 * 60) {
    return withClockTime(z, 23, 45, 0);
  }
  return withClockTime(z, Math.floor(ceiled / 60), ceiled % 60, 0);
}

/** If plan start landed after midnight while "now" is still evening, re-anchor to now. */
export function alignPlanStartWithNow(
  planStart: ZonedClock,
  now: ZonedClock,
  instant: Date,
): ZonedClock {
  if (isEveningTorontoHour(now.hour) && isLateNightMorningHour(planStart.hour)) {
    return roundUpToNextQuarterHour(instant, now.timeZone);
  }
  return planStart;
}

/** Default 11:00 PM Toronto tonight; never after midnight for routine evening plans. */
export function getEveningBedtimeClock(
  now: ZonedClock,
  userMessage?: string,
): ZonedClock {
  let hour = DEFAULT_BEDTIME_HOUR;
  let minute = DEFAULT_BEDTIME_MINUTE;
  if (userMessage && userExplicitlyWantsLateEvening(userMessage)) {
    hour = 23;
    minute = 30;
  }
  return withClockTime(now, hour, minute, 0);
}

export type EveningPlanLimits = {
  planStart: ZonedClock;
  bedtime: ZonedClock;
  minutesUntilBedtime: number;
  nearBedtime: boolean;
  veryNearBedtime: boolean;
  maxEvents: number;
  maxBlockMinutes: number;
  lightActivitiesOnly: boolean;
};

export function getEveningPlanLimits(
  instant: Date,
  userMessage?: string,
  timeZone: string = EVENING_PLAN_TIMEZONE,
): EveningPlanLimits {
  const now = getZonedClock(instant, timeZone);
  let planStart = roundUpToNextQuarterHour(instant, timeZone);
  planStart = alignPlanStartWithNow(planStart, now, instant);
  const bedtime = getEveningBedtimeClock(now, userMessage);
  const planStartInstant = clockToInstant(planStart);
  const bedtimeInstant = clockToInstant(bedtime);
  const minutesUntilBedtime = Math.max(
    0,
    Math.floor((bedtimeInstant.getTime() - planStartInstant.getTime()) / 60_000),
  );
  const veryNearBedtime = minutesUntilBedtime <= 30;
  const nearBedtime = minutesUntilBedtime <= 60;
  const lightActivitiesOnly = veryNearBedtime || totalMinutes(planStart) >= 22 * 60;

  let maxEvents = 4;
  let maxBlockMinutes = 45;
  if (veryNearBedtime) {
    maxEvents = 1;
    maxBlockMinutes = 20;
  } else if (nearBedtime) {
    maxEvents = 2;
    maxBlockMinutes = 30;
  } else if (lightActivitiesOnly) {
    maxEvents = 2;
    maxBlockMinutes = 30;
  }

  return {
    planStart,
    bedtime,
    minutesUntilBedtime,
    nearBedtime,
    veryNearBedtime,
    maxEvents,
    maxBlockMinutes,
    lightActivitiesOnly,
  };
}

function eventDurationMs(ev: ScheduleItem, capMinutes: number): number {
  const start = new Date(ev.start_time);
  const end = ev.end_time ? new Date(ev.end_time) : new Date(start.getTime() + 45 * 60 * 1000);
  const ms = end.getTime() - start.getTime();
  const capped = capMinutes * 60 * 1000;
  return Math.max(15 * 60 * 1000, Math.min(capped, Number.isFinite(ms) ? ms : capped));
}

/**
 * Re-map planned activities to tonight (Toronto): quarter-hour start → 11 PM bedtime, today only.
 */
export function coerceBoredomScheduleEvents(
  events: ScheduleItem[],
  opts: {
    now?: Date;
    nowIso?: string;
    userMessage?: string;
    todayEvents?: ScheduleItem[];
  },
): ScheduleItem[] {
  const instant = opts.nowIso ? new Date(opts.nowIso) : opts.now ?? new Date();
  const limits = getEveningPlanLimits(instant, opts.userMessage);
  const { planStart, bedtime, maxEvents, maxBlockMinutes } = limits;

  if (limits.minutesUntilBedtime < 10) {
    return [];
  }

  let cursor = planStart;
  const sorted = [...events].sort(
    (a, b) => +new Date(a.start_time) - +new Date(b.start_time),
  );
  const result: ScheduleItem[] = [];

  for (const ev of sorted.slice(0, maxEvents)) {
    if (totalMinutes(cursor) >= totalMinutes(bedtime)) break;
    if (cursor.hour >= 0 && cursor.hour < 6) break;

    const durationMs = eventDurationMs(ev, maxBlockMinutes);
    const startInstant = clockToInstant(cursor);
    let endInstant = new Date(startInstant.getTime() + durationMs);
    const bedtimeInstant = clockToInstant(bedtime);

    if (startInstant >= bedtimeInstant) break;
    if (endInstant > bedtimeInstant) endInstant = bedtimeInstant;
    if (endInstant.getTime() <= startInstant.getTime()) break;

    const endClock = getZonedClock(endInstant, EVENING_PLAN_TIMEZONE);
    if (endClock.hour === 0 && endClock.minute > 0) break;
    if (endClock.hour > 0 && endClock.hour < 6) break;

    result.push({
      ...ev,
      start_time: startInstant.toISOString(),
      end_time: endInstant.toISOString(),
    });

    cursor = getZonedClock(endInstant, EVENING_PLAN_TIMEZONE);
  }

  return result;
}

export function formatZonedTime(clock: ZonedClock): string {
  const d = clockToInstant(clock);
  return d.toLocaleTimeString("en-CA", {
    timeZone: clock.timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function buildBoredomPlanningContextBlock(opts: {
  nowIso: string;
  events: ScheduleContextEvent[];
  userMessage?: string;
}): string {
  const instant = new Date(opts.nowIso);
  const limits = getEveningPlanLimits(instant, opts.userMessage);
  const now = getZonedClock(instant, EVENING_PLAN_TIMEZONE);
  const { planStart, bedtime, lightActivitiesOnly, veryNearBedtime, nearBedtime, maxEvents } =
    limits;

  const todayDate = instant.toLocaleDateString("en-CA", {
    timeZone: EVENING_PLAN_TIMEZONE,
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const tzLabel = "America/Toronto (Eastern Time)";

  const planStartIso = clockToInstant(planStart).toISOString();
  const bedtimeIso = clockToInstant(bedtime).toISOString();

  const lines = [
    "BOREDOM / EVENING ACTIVITY PLANNING (mandatory for this message):",
    `- Use ${tzLabel} for all times. Now and schedule blocks must match this timezone (not UTC).`,
    `- Plan ONLY for ${todayDate} (today). Do NOT use tomorrow's date unless the user explicitly asked for tomorrow.`,
    `- Current Eastern Time now: ${formatZonedTime(now)}.`,
    `- First activity starts at ${formatZonedTime(planStart)} (next quarter-hour from now — NOT midnight unless it is actually near midnight).`,
    `- Example first start_time ISO: ${planStartIso}`,
    `- Last activity must end by ${formatZonedTime(bedtime)} (healthy default bedtime; example end bound: ${bedtimeIso}).`,
    "- Never schedule optional activities after 11:00 PM or after midnight (no 12:00 AM–1:00 AM blocks when the user is planning their evening).",
    `- Schedule at most ${maxEvents} activities in this window.`,
    "- Space activities sequentially from the quarter-hour start until bedtime.",
    "- Call schedule_event once per activity with start_time and end_time as ISO datetimes on TODAY's calendar date in Eastern Time.",
  ];

  if (veryNearBedtime) {
    lines.push(
      "- It is very close to bedtime: suggest only 1 light wind-down activity (reading, tea, stretch, brief walk) — no late-night outings or screens marathons.",
    );
  } else if (nearBedtime || lightActivitiesOnly) {
    lines.push(
      "- Keep the plan short with lighter activities only (wind-down, light snack, reading, gentle walk) — no heavy outings.",
    );
  } else {
    lines.push(
      '- Example tone: "Let\'s make the most of your evening! Here are a few suggestions from ' +
        `${formatZonedTime(planStart)} to ${formatZonedTime(bedtime)}…"`,
    );
  }

  return lines.join("\n");
}
