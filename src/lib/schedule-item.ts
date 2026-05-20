import { z } from "zod";

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

/**
 * Fallback when the model replies in text only — extracts title, date, time, description.
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

  if (!title || title.length < 2) return null;

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
