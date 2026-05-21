import type { QueryClient } from "@tanstack/react-query";
import { backendAvailable, demoUser } from "@/lib/demo-mode";
import { isSameCalendarDay } from "@/lib/schedule-item";

export type TimelineEventRow = {
  id: string;
  title: string;
  subtitle: string | null;
  start_time: string;
  level: string;
};

export function resolveTimelineUserId(userId: string): string {
  return backendAvailable ? userId : demoUser.id;
}

/** Keep Homepage "Today's schedule" in sync after approval (same query key as index.tsx). */
export function upsertTodayEventInCache(
  qc: QueryClient,
  userId: string,
  event: TimelineEventRow,
): void {
  if (!isSameCalendarDay(event.start_time)) return;

  const timelineUserId = resolveTimelineUserId(userId);
  const today = new Date().toISOString().slice(0, 10);

  qc.setQueryData<TimelineEventRow[]>(["events", timelineUserId, today], (old) => {
    const prev = old ?? [];
    const next = prev.filter((e) => e.id !== event.id);
    next.push(event);
    return next.sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time));
  });
}

export async function refreshTodayEventsCache(qc: QueryClient, userId: string): Promise<void> {
  const timelineUserId = resolveTimelineUserId(userId);
  const today = new Date().toISOString().slice(0, 10);
  await qc.invalidateQueries({ queryKey: ["events", timelineUserId, today] });
  await qc.invalidateQueries({ queryKey: ["events", timelineUserId] });
}
