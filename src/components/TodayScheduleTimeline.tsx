import { useEffect, useMemo, useState } from "react";
import { ScheduleEventActions } from "@/components/ScheduleEventActions";
import { SchedulePriorityIndicator } from "@/components/SchedulePriorityIndicator";
import {
  EVENING_PLAN_TIMEZONE,
  formatZonedTime,
  getZonedClock,
} from "@/lib/boredom-schedule";
import type { TimelineEventRow } from "@/lib/schedule-timeline-cache";

const NOW_TICK_MS = 30_000;

type TimelineRow =
  | { kind: "now"; minutes: number }
  | { kind: "event"; event: TimelineEventRow; minutes: number };

function minutesInToronto(instant: Date): number {
  const z = getZonedClock(instant, EVENING_PLAN_TIMEZONE);
  return z.hour * 60 + z.minute;
}

function formatEventTimeToronto(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-CA", {
    timeZone: EVENING_PLAN_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function buildTimelineRows(events: TimelineEventRow[], now: Date): TimelineRow[] {
  const nowMins = minutesInToronto(now);
  const sorted = [...events].sort(
    (a, b) => +new Date(a.start_time) - +new Date(b.start_time),
  );
  const rows: TimelineRow[] = [];
  let insertedNow = false;

  for (const event of sorted) {
    const eventMins = minutesInToronto(new Date(event.start_time));
    if (!insertedNow && nowMins < eventMins) {
      rows.push({ kind: "now", minutes: nowMins });
      insertedNow = true;
    }
    rows.push({ kind: "event", event, minutes: eventMins });
  }

  if (!insertedNow) {
    rows.push({ kind: "now", minutes: nowMins });
  }

  return rows;
}

function NowMarkerRow({ timeLabel }: { timeLabel: string }) {
  return (
    <li className="relative z-10 flex items-center gap-3 py-2">
      <span className="w-12 shrink-0 text-right text-base font-semibold leading-none tracking-tight text-primary">
        {timeLabel}
      </span>
      <span
        className="relative z-10 h-3 w-3 shrink-0 rounded-full bg-primary ring-4 ring-primary/25"
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="h-px flex-1 bg-primary/50" aria-hidden />
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-primary">
          Now
        </span>
      </div>
    </li>
  );
}

function ScheduleEventRow({
  event,
  userId,
}: {
  event: TimelineEventRow;
  userId: string;
}) {
  return (
    <li className="relative flex items-start gap-3">
      <span className="w-12 shrink-0 pt-0.5 text-[11px] font-medium leading-tight text-muted-foreground">
        {formatEventTimeToronto(event.start_time)}
      </span>
      <SchedulePriorityIndicator
        level={event.level}
        title={event.title}
        variant="dot"
        className="relative z-10 mt-1"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-tight">{event.title}</div>
        {event.subtitle ? (
          <div className="text-xs text-muted-foreground">{event.subtitle}</div>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <SchedulePriorityIndicator level={event.level} title={event.title} variant="chip" />
        <ScheduleEventActions event={event} userId={userId} />
      </div>
    </li>
  );
}

type Props = {
  events: TimelineEventRow[];
  userId: string;
};

export function TodayScheduleTimeline({ events, userId }: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), NOW_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const nowLabel = formatZonedTime(getZonedClock(now, EVENING_PLAN_TIMEZONE));
  const rows = useMemo(() => buildTimelineRows(events, now), [events, now]);

  if (events.length === 0) {
    return (
      <div className="relative py-2">
        <ul>
          <NowMarkerRow timeLabel={nowLabel} />
        </ul>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          No events yet. Load a sample day above or ask Simone to plan one.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-[42px] top-6 bottom-6 w-px bg-border" aria-hidden />
      <ul className="space-y-4">
        {rows.map((row) =>
          row.kind === "now" ? (
            <NowMarkerRow key="now" timeLabel={nowLabel} />
          ) : (
            <ScheduleEventRow key={row.event.id} event={row.event} userId={userId} />
          ),
        )}
      </ul>
    </div>
  );
}
