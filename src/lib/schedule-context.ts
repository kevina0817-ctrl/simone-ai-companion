import { isSameCalendarDay } from "@/lib/schedule-item";

export type ScheduleContextEvent = {
  id: string;
  title: string;
  subtitle?: string | null;
  start_time: string;
  level?: string;
};

/** Same day bounds the Homepage timeline uses (local calendar day). */
export function getLocalCalendarDayBounds(ref = new Date()) {
  const start = new Date(ref);
  start.setHours(0, 0, 0, 0);
  const end = new Date(ref);
  end.setHours(23, 59, 59, 999);
  return { start, end, startIso: start.toISOString(), endIso: end.toISOString() };
}

export function filterEventsForToday<T extends { start_time: string }>(
  events: T[],
  ref = new Date(),
): T[] {
  return events.filter((e) => isSameCalendarDay(e.start_time, ref));
}

export function formatScheduleContextLines(events: ScheduleContextEvent[]): string {
  if (!events.length) return "- Nothing on today's schedule.";
  return events
    .map((e) => {
      const when = new Date(e.start_time).toLocaleString([], {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      });
      const detail = e.subtitle ? ` — ${e.subtitle}` : "";
      const level = e.level ? ` (${e.level})` : "";
      return `- id=${e.id} | ${when} | ${e.title}${detail}${level}`;
    })
    .join("\n");
}

export function buildScheduleContextBlock(opts: {
  nowIso: string;
  timezone: string;
  wellnessLine: string;
  events: ScheduleContextEvent[];
  heading?: string;
}): string {
  const when = new Date(opts.nowIso).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const heading = opts.heading ?? "Today's schedule";
  return [
    `Now: ${when} (${opts.timezone}).`,
    `Wellness today: ${opts.wellnessLine}`,
    `${heading}:`,
    formatScheduleContextLines(opts.events),
  ].join("\n");
}
