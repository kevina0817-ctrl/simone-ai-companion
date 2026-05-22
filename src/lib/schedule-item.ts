import { z } from "zod";

function looksLikeOrderOrProductLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/\b(?:US\$|CA\$|CAD|USD|\$\d|approximately|price|priced|cost)\b/i.test(t)) return true;
  if (/\b(?:sent to approvals?|pending approval|monthly budget)\b/i.test(t)) return true;
  if (
    /\b(?:tiffany|pendant|necklace|bag|shoes|grocery|groceries|amazon|jewelry|jewellery)\b/i.test(t) &&
    !/\b(?:at|@)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

export type ScheduleLevel = "High" | "Medium" | "Low";

/** Shape used by the Homepage timeline and demo localStorage. */
export type ScheduleItem = {
  id: string;
  title: string;
  subtitle: string | null;
  start_time: string;
  level: ScheduleLevel;
};

const toolArgsSchema = z.object({
  title: z.string().min(1).max(120),
  subtitle: z.string().max(200).optional(),
  description: z.string().max(200).optional(),
  start_time: z.string().min(1),
  level: z.enum(["High", "Medium", "Low"]).optional(),
});

export function normalizeScheduleFromToolArgs(
  args: unknown,
  id?: string,
): ScheduleItem | null {
  const parsed = toolArgsSchema.safeParse(args);
  if (!parsed.success) return null;

  const startDate = new Date(parsed.data.start_time);
  if (isNaN(startDate.getTime())) return null;

  const description = parsed.data.subtitle ?? parsed.data.description ?? null;

  return {
    id: id ?? `schedule-${Date.now()}`,
    title: parsed.data.title.trim(),
    subtitle: description?.trim() || null,
    start_time: startDate.toISOString(),
    level: parsed.data.level ?? "Medium",
  };
}

const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const GENERIC_TITLE =
  /^(these|those|all|them|the|this|that|above|below|it|events?|the events?|each event|every event|weekend plan|my plan|your plan)\b/i;

export function isValidScheduleTitle(title: string): boolean {
  const t = title.trim().replace(/[.:—–-]+$/g, "").trim();
  if (t.length < 2 || t.length > 120) return false;
  if (GENERIC_TITLE.test(t)) return false;
  return true;
}

/** User wants every event from Simone's reply queued separately on Approvals. */
export function wantsBulkScheduleApprovals(text: string): boolean {
  const n = text.toLowerCase();
  return (
    /\b(add|put|send|queue|approve)\b/.test(n) &&
    (/\b(all|every|each|these|those)\b/.test(n) || /\bapprovals?\b/.test(n)) &&
    /\b(event|events|plan|schedule|itinerary|them)\b/.test(n)
  );
}

function resolveWeekday(dayName: string, ref: Date): Date {
  const target = WEEKDAY_NAMES.indexOf(dayName.toLowerCase() as (typeof WEEKDAY_NAMES)[number]);
  const d = new Date(ref);
  const delta = (target - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + delta);
  d.setHours(9, 0, 0, 0);
  return d;
}

function parseClockToken(
  token: string,
  defaultMeridiem?: "am" | "pm",
): { hour: number; minute: number } | null {
  const m = token.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const meridiem = (m[3]?.toLowerCase() ?? defaultMeridiem) as "am" | "pm" | undefined;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!meridiem && hour >= 1 && hour <= 7) hour += 12;
  return { hour, minute };
}

function buildScheduleItem(
  title: string,
  day: Date,
  hour: number,
  minute: number,
  subtitle: string | null,
  ref: Date,
  index: number,
): ScheduleItem | null {
  if (!isValidScheduleTitle(title)) return null;
  const start = new Date(day);
  start.setHours(hour, minute, 0, 0);
  return {
    id: `schedule-${ref.getTime()}-${index}`,
    title: title.trim().slice(0, 120),
    subtitle: subtitle?.trim().slice(0, 200) ?? null,
    start_time: start.toISOString(),
    level: "Medium",
  };
}

/**
 * Extract multiple events from plans, bullet lists, and weekend itineraries in chat text.
 */
export function parseSchedulesFromText(text: string, ref = new Date()): ScheduleItem[] {
  const results: ScheduleItem[] = [];
  const seen = new Set<string>();
  let currentDay: Date | null = null;
  let index = 0;

  const push = (item: ScheduleItem | null) => {
    if (!item) return;
    const key = `${item.title.toLowerCase()}|${item.start_time}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(item);
  };

  for (const rawLine of text.split(/\n/)) {
    const line = rawLine.trim().replace(/\*\*/g, "");
    if (!line || line.length < 3) continue;
    if (/^(here'?s|your|my)\b/i.test(line) && /\b(plan|schedule|weekend)\b/i.test(line)) continue;

    const dayOnly = line.match(
      /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*[:(]?\s*$/i,
    );
    if (dayOnly) {
      currentDay = resolveWeekday(dayOnly[1], ref);
      continue;
    }

    const dayHeader = line.match(
      /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*[:-–—]\s*(.+)$/i,
    );
    if (dayHeader) {
      currentDay = resolveWeekday(dayHeader[1], ref);
      const rest = dayHeader[2].trim();
      if (rest) {
        const parsed = parseScheduleLine(rest, currentDay, ref, index++);
        push(parsed);
      }
      continue;
    }

    const bullet = line.match(/^[-*•]\s+(.+)$/);
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    const content = (bullet?.[1] ?? numbered?.[1] ?? line).trim();

    if (looksLikeOrderOrProductLine(content)) continue;

    const dayInLine = content.match(
      /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b[,:]?\s+(.+)$/i,
    );
    if (dayInLine) {
      currentDay = resolveWeekday(dayInLine[1], ref);
      push(parseScheduleLine(dayInLine[2], currentDay, ref, index++));
      continue;
    }

    const day = currentDay ?? ref;
    push(parseScheduleLine(content, day, ref, index++));
  }

  return results.sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time));
}

function parseScheduleLine(
  line: string,
  day: Date,
  ref: Date,
  index: number,
): ScheduleItem | null {
  let working = line.trim();
  let eventDay = new Date(day);

  const weekdayLead = working.match(
    /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[-–—:]\s*(.+)$/i,
  );
  if (weekdayLead) {
    eventDay = resolveWeekday(weekdayLead[1], ref);
    const clock = parseClockToken(weekdayLead[2]);
    if (clock) {
      return buildScheduleItem(weekdayLead[3], eventDay, clock.hour, clock.minute, null, ref, index);
    }
    working = weekdayLead[3];
  }

  const timeFirst = working.match(
    /^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[-–—:]+\s*(.+)$/i,
  );
  if (timeFirst) {
    const clock = parseClockToken(timeFirst[1]);
    if (clock) return buildScheduleItem(timeFirst[2], eventDay, clock.hour, clock.minute, null, ref, index);
  }

  const timeLast = working.match(
    /^(.+?)\s+(?:at|@)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*$/i,
  );
  if (timeLast) {
    const clock = parseClockToken(timeLast[2]);
    if (clock) return buildScheduleItem(timeLast[1], eventDay, clock.hour, clock.minute, null, ref, index);
  }

  const atMatch = working.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (atMatch) {
    const clock = parseClockToken(
      `${atMatch[1]}${atMatch[2] ? `:${atMatch[2]}` : ""}${atMatch[3] ? ` ${atMatch[3]}` : ""}`,
    );
    const title = working.replace(atMatch[0], "").trim().replace(/^[-–—:]+\s*/, "");
    if (clock && title) return buildScheduleItem(title, eventDay, clock.hour, clock.minute, null, ref, index);
  }

  if (/\b(morning|afternoon|evening|night)\b/i.test(working)) {
    const hour =
      /\bmorning\b/i.test(working) ? 9 : /\bafternoon\b/i.test(working) ? 14 : /\bevening\b/i.test(working) ? 18 : 20;
    const title = working
      .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, "")
      .replace(/\b(morning|afternoon|evening|night)\b/gi, "")
      .replace(/^[-–—:]+\s*/, "")
      .trim();
    if (title) return buildScheduleItem(title, eventDay, hour, 0, null, ref, index);
  }

  if (isValidScheduleTitle(working)) {
    const d = new Date(eventDay);
    d.setHours(9 + (index % 5), (index % 2) * 30, 0, 0);
    return buildScheduleItem(working, d, d.getHours(), d.getMinutes(), null, ref, index);
  }

  return null;
}

/**
 * Fallback when the model replies in text only — extracts a single event.
 */
export function parseScheduleFromText(text: string, ref = new Date()): ScheduleItem | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const scheduleIntent =
    /\b(schedule|book|add|set up|plan|put|create)\b/i.test(trimmed) &&
    /\b(meeting|event|appointment|call|session|lunch|dinner|workout|yoga|reminder|block)\b/i.test(trimmed);
  if (!scheduleIntent) return null;

  let working = trimmed;
  let day = new Date(ref);

  if (/\btomorrow\b/i.test(working)) {
    day = new Date(ref);
    day.setDate(day.getDate() + 1);
    working = working.replace(/\btomorrow\b/gi, " ");
  } else if (/\btoday\b/i.test(working)) {
    working = working.replace(/\btoday\b/gi, " ");
  }

  const weekdayMatch = working.match(
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  );
  if (weekdayMatch) {
    const target = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(
      weekdayMatch[1].toLowerCase(),
    );
    const d = new Date(ref);
    const delta = (target - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + delta);
    day = d;
    working = working.replace(weekdayMatch[0], " ");
  }

  let hour = 9;
  let minute = 0;

  const atMatch = working.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (atMatch) {
    hour = parseInt(atMatch[1], 10);
    minute = atMatch[2] ? parseInt(atMatch[2], 10) : 0;
    const meridiem = atMatch[3]?.toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    if (!meridiem && hour < 8) hour += 12;
    working = working.replace(atMatch[0], " ");
  }

  day.setHours(hour, minute, 0, 0);

  const titleCandidates = [
    working.match(
      /(?:schedule|book|add|set up|plan)\s+(?:a\s+)?(.+?)(?:\s+at\s+|\s+on\s+|\s+for\s+|$)/i,
    )?.[1],
    working.match(
      /(?:meeting|appointment|call|session|event)\s+(?:called\s+)?(.+?)(?:\s+at\s+|\s+on\s+|$)/i,
    )?.[1],
  ].filter(Boolean) as string[];

  const title = (titleCandidates[0] ?? "New event")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  const descriptionMatch = working.match(
    /(?:description|details|note):\s*(.+)$/i,
  );
  const subtitle = descriptionMatch?.[1]?.trim().slice(0, 200) ?? null;

  if (!isValidScheduleTitle(title)) return null;

  return {
    id: `schedule-${Date.now()}`,
    title,
    subtitle,
    start_time: day.toISOString(),
    level: "Medium",
  };
}

export function isSameCalendarDay(iso: string, day = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

/** Approved chat events target Today's schedule — keep clock time, move to local today if needed. */
export function coerceEventToToday(iso: string, ref = new Date()): string {
  const proposed = new Date(iso);
  if (Number.isNaN(proposed.getTime())) {
    const fallback = new Date(ref);
    fallback.setHours(9, 0, 0, 0);
    return fallback.toISOString();
  }
  if (isSameCalendarDay(iso, ref)) return proposed.toISOString();

  const today = new Date(ref);
  today.setHours(proposed.getHours(), proposed.getMinutes(), 0, 0);
  return today.toISOString();
}

export type CancelMatchCriteria = {
  id?: string;
  event_id?: string;
  title?: string;
  start_time?: string;
};

/** Match an event on the Homepage timeline (id, title, and/or time). */
export function findScheduleEventForCancel<T extends { id: string; title: string; start_time: string }>(
  events: T[],
  criteria: CancelMatchCriteria,
  hintText?: string,
): T | null {
  const eventId = criteria.id ?? criteria.event_id;
  if (eventId) {
    const byId = events.find((e) => e.id === eventId);
    if (byId) return byId;
  }

  if (criteria.title || criteria.start_time) {
    const lcTitle = criteria.title?.toLowerCase();
    const startMs = criteria.start_time ? new Date(criteria.start_time).getTime() : null;
    const match = events.find((e) => {
      const titleOk = lcTitle ? e.title.toLowerCase().includes(lcTitle) : true;
      const timeOk = startMs
        ? Math.abs(new Date(e.start_time).getTime() - startMs) < 30 * 60 * 1000
        : true;
      return titleOk && timeOk;
    });
    if (match) return match;
  }

  if (hintText) {
    const normalized = hintText.toLowerCase();
    const byHint = events.find((e) => {
      const words = e.title.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      return words.some((w) => normalized.includes(w));
    });
    if (byHint) return byHint;
  }

  return null;
}

/** Fallback when the model does not call cancel_event. */
export function parseCancelFromText(text: string): CancelMatchCriteria | null {
  const trimmed = text.trim();
  if (!/\b(cancel|remove|delete|drop|skip)\b/i.test(trimmed)) return null;

  const titleMatch = trimmed.match(
    /(?:cancel|remove|delete|drop|skip)\s+(?:my\s+)?(?:the\s+)?(.+?)(?:\s+(?:meeting|event|appointment|call|session)|\s+at\s+|\s+on\s+|$)/i,
  );

  return { title: titleMatch?.[1]?.trim().slice(0, 120) };
}
