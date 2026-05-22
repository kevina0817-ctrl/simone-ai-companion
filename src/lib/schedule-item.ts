import { z } from "zod";
import { inferScheduleLevelFromTitle, resolveScheduleLevel } from "@/lib/schedule-priority";

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

/** Unique id per event — avoids Approvals overwriting when many events are queued at once. */
export function generateScheduleId(): string {
  return `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Shape used by the Homepage timeline and demo localStorage. */
export type ScheduleItem = {
  id: string;
  title: string;
  subtitle: string | null;
  start_time: string;
  /** End of block (required for Approvals extraction; optional on persisted timeline rows). */
  end_time?: string;
  level: ScheduleLevel;
};

const toolArgsSchema = z.object({
  title: z.string().min(1).max(120),
  subtitle: z.string().max(200).optional(),
  description: z.string().max(200).optional(),
  start_time: z.string().min(1),
  end_time: z.string().min(1).optional(),
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

  let endIso: string | undefined;
  if (parsed.data.end_time) {
    const endDate = new Date(parsed.data.end_time);
    if (!isNaN(endDate.getTime())) endIso = endDate.toISOString();
  }

  const description = parsed.data.subtitle ?? parsed.data.description ?? null;

  const item: ScheduleItem = {
    id: id ?? generateScheduleId(),
    title: parsed.data.title.trim(),
    subtitle: description?.trim() || null,
    start_time: startDate.toISOString(),
    end_time: endIso,
    level: resolveScheduleLevel(parsed.data.level, parsed.data.title.trim()),
  };

  return isValidStructuredScheduleEvent(item) ? item : null;
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

const DESCRIPTIVE_TITLE =
  /^(?:time|when|details?|note|description)\s*:?\s*$/i;

const TITLE_WITH_EXPLANATION =
  /^([a-z][a-z\s]{0,30}):\s*(?:finish|start|wrap|wind|enjoy|have|take|end)\b/i;

/** Lowercase, collapsed spaces, punctuation stripped — for duplicate event detection. */
export function normalizeScheduleEventTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** One event per normalized title; later entries replace earlier (updated schedule wins). */
export function dedupeScheduleEventsByTitle(items: ScheduleItem[]): ScheduleItem[] {
  const lastByKey = new Map<string, ScheduleItem>();
  const keyOrder: string[] = [];

  for (const item of items) {
    const key = normalizeScheduleEventTitle(item.title);
    if (!key) continue;
    if (!lastByKey.has(key)) keyOrder.push(key);
    lastByKey.set(key, item);
  }

  return keyOrder.map((k) => lastByKey.get(k)!);
}

export function isValidScheduleTitle(title: string): boolean {
  const t = title.trim().replace(/[.:—–-]+$/g, "").trim();
  if (t.length < 2 || t.length > 80) return false;
  if (GENERIC_TITLE.test(t)) return false;
  if (DESCRIPTIVE_TITLE.test(t)) return false;
  if (TITLE_WITH_EXPLANATION.test(t)) return false;
  if (/\b(?:finish the day|balanced meal|further assistance|let me know)\b/i.test(t)) return false;
  return true;
}

/** Approvals: title plus valid start/end window (from tool JSON or structured list lines). */
export function isValidStructuredScheduleEvent(item: ScheduleItem): boolean {
  if (!isValidScheduleTitle(item.title)) return false;
  const start = new Date(item.start_time);
  if (Number.isNaN(start.getTime())) return false;
  if (!item.end_time) return false;
  const end = new Date(item.end_time);
  if (Number.isNaN(end.getTime())) return false;
  if (end.getTime() <= start.getTime()) return false;
  if (end.getTime() - start.getTime() > 24 * 60 * 60 * 1000) return false;
  return true;
}

export function formatScheduleTimeRange(item: ScheduleItem): string {
  const start = new Date(item.start_time);
  const end = item.end_time ? new Date(item.end_time) : null;
  const fmt = (d: Date) =>
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  if (end && !Number.isNaN(end.getTime())) {
    return `${fmt(start)} – ${fmt(end)}`;
  }
  return start.toLocaleString([], {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
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

function clockOnDay(
  token: string,
  day: Date,
  defaultMeridiem?: "am" | "pm",
): Date | null {
  const clock = parseClockToken(token, defaultMeridiem);
  if (!clock) return null;
  const d = new Date(day);
  d.setHours(clock.hour, clock.minute, 0, 0);
  return d;
}

function looksLikeDescriptiveScheduleLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^time\s*:/i.test(t)) return true;
  if (/^(?:details?|note|description)\s*:/i.test(t)) return true;
  if (TITLE_WITH_EXPLANATION.test(t)) return true;
  if (looksLikeOrderOrProductLine(t)) return true;
  return false;
}

/** "Pilates — 8:00 AM - 9:00 AM" → structured event; ignores prose-only lines. */
function parseStructuredScheduleLine(
  line: string,
  day: Date,
  ref: Date,
  index: number,
): ScheduleItem | null {
  if (looksLikeDescriptiveScheduleLine(line)) return null;

  let working = line.trim().replace(/\*\*/g, "");
  let eventDay = new Date(day);

  const weekdayLead = working.match(
    /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(.+)$/i,
  );
  if (weekdayLead) {
    eventDay = resolveWeekday(weekdayLead[1], ref);
    working = weekdayLead[2].trim();
  }

  const rangeMatch = working.match(
    /^(.+?)\s*[—–-]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*$/i,
  );
  if (!rangeMatch) return null;

  const title = rangeMatch[1].trim();
  const startToken = rangeMatch[2].trim();
  const endToken = rangeMatch[3].trim();
  if (!isValidScheduleTitle(title)) return null;

  const startMeridiem = startToken.match(/(am|pm)\b/i)?.[1]?.toLowerCase() as "am" | "pm" | undefined;
  const start = clockOnDay(startToken, eventDay, startMeridiem);
  const end = clockOnDay(endToken, eventDay, startMeridiem ?? (start && start.getHours() >= 12 ? "pm" : "am"));
  if (!start || !end) return null;

  let endDate = end;
  if (endDate.getTime() <= start.getTime()) {
    endDate = new Date(endDate.getTime() + 12 * 60 * 60 * 1000);
  }
  if (endDate.getTime() <= start.getTime()) return null;

  const item: ScheduleItem = {
    id: generateScheduleId(),
    title: title.slice(0, 120),
    subtitle: null,
    start_time: start.toISOString(),
    end_time: endDate.toISOString(),
    level: inferScheduleLevelFromTitle(title),
  };

  return isValidStructuredScheduleEvent(item) ? item : null;
}

/**
 * Extract schedule events from structured list lines in **user** text only.
 * Format: Title — 8:00 AM - 9:00 AM (one event per line).
 */
export function parseStructuredSchedulesFromText(text: string, ref = new Date()): ScheduleItem[] {
  const parsed: ScheduleItem[] = [];
  let currentDay: Date | null = null;
  let index = 0;

  const push = (item: ScheduleItem | null) => {
    if (!item || !isValidStructuredScheduleEvent(item)) return;
    parsed.push(item);
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
      if (rest) push(parseStructuredScheduleLine(rest, currentDay, ref, index++));
      continue;
    }

    const bullet = line.match(/^[-*•]\s+(.+)$/);
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    const content = (bullet?.[1] ?? numbered?.[1] ?? line).trim();

    const dayInLine = content.match(
      /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b[,:]?\s+(.+)$/i,
    );
    if (dayInLine) {
      currentDay = resolveWeekday(dayInLine[1], ref);
      push(parseStructuredScheduleLine(dayInLine[2], currentDay, ref, index++));
      continue;
    }

    push(parseStructuredScheduleLine(content, currentDay ?? ref, ref, index++));
  }

  return dedupeScheduleEventsByTitle(parsed).sort(
    (a, b) => +new Date(a.start_time) - +new Date(b.start_time),
  );
}

/** @deprecated Use parseStructuredSchedulesFromText — never parse assistant prose. */
export function parseSchedulesFromText(text: string, ref = new Date()): ScheduleItem[] {
  return parseStructuredSchedulesFromText(text, ref);
}

/**
 * Fallback when the model replies in text only — extracts a single event.
 */
export function parseScheduleFromText(text: string, ref = new Date()): ScheduleItem | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const structured = parseStructuredSchedulesFromText(trimmed, ref);
  if (structured.length === 1) return structured[0]!;
  if (structured.length > 1) return null;

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

  const end = new Date(day);
  end.setHours(hour + 1, minute, 0, 0);

  const item: ScheduleItem = {
    id: generateScheduleId(),
    title,
    subtitle,
    start_time: day.toISOString(),
    end_time: end.toISOString(),
    level: inferScheduleLevelFromTitle(title),
  };

  return isValidStructuredScheduleEvent(item) ? item : null;
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
