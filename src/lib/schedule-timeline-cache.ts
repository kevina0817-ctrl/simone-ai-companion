import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  backendAvailable,
  demoUser,
  getDemoEvents,
  removeScheduleItemById,
  updateScheduleItem,
} from "@/lib/demo-mode";
import type { ScheduleLevel } from "@/lib/schedule-item";
import { getLocalCalendarDayBounds } from "@/lib/schedule-context";
import { coerceEventToToday, isSameCalendarDay, type ScheduleItem } from "@/lib/schedule-item";

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

export function todayQueryKey(userId: string) {
  const timelineUserId = resolveTimelineUserId(userId);
  const today = new Date().toISOString().slice(0, 10);
  return ["events", timelineUserId, today] as const;
}

/** Same source of truth as the Homepage timeline list. */
export async function loadTodayTimelineEvents(userId: string): Promise<TimelineEventRow[]> {
  const timelineUserId = resolveTimelineUserId(userId);

  if (!backendAvailable) {
    return getDemoEvents()
      .filter((e) => isSameCalendarDay(e.start_time))
      .map((e) => ({
        id: e.id,
        title: e.title,
        subtitle: e.subtitle,
        start_time: e.start_time,
        level: e.level,
      }));
  }

  const { startIso, endIso } = getLocalCalendarDayBounds();
  const { data, error } = await supabase
    .from("schedule_events")
    .select("id,title,subtitle,start_time,level")
    .eq("user_id", timelineUserId)
    .gte("start_time", startIso)
    .lte("start_time", endIso)
    .order("start_time", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    start_time: row.start_time,
    level: row.level,
  }));
}

/** Keep Homepage "Today's schedule" in sync after approval. */
export function upsertTodayEventInCache(
  qc: QueryClient,
  userId: string,
  event: TimelineEventRow,
): void {
  const timelineUserId = resolveTimelineUserId(userId);
  const key = todayQueryKey(timelineUserId);

  qc.setQueryData<TimelineEventRow[]>(key, (old) => {
    const prev = old ?? [];
    const next = prev.filter((e) => e.id !== event.id);
    next.push(event);
    return next.sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time));
  });
}

export async function refreshTodayEventsCache(qc: QueryClient, userId: string): Promise<void> {
  const timelineUserId = resolveTimelineUserId(userId);
  const key = todayQueryKey(timelineUserId);
  const rows = await loadTodayTimelineEvents(timelineUserId);
  qc.setQueryData(key, rows);
}

export function prepareScheduleForToday(item: ScheduleItem): ScheduleItem {
  return {
    ...item,
    start_time: coerceEventToToday(item.start_time),
  };
}

export async function removeTimelineEventById(
  qc: QueryClient,
  userId: string,
  eventId: string,
): Promise<void> {
  const timelineUserId = resolveTimelineUserId(userId);

  if (backendAvailable) {
    const { error } = await supabase
      .from("schedule_events")
      .delete()
      .eq("id", eventId)
      .eq("user_id", timelineUserId);
    if (error) throw error;
  } else {
    removeScheduleItemById(eventId);
  }

  await refreshTodayEventsCache(qc, timelineUserId);
}

export async function updateTimelineEvent(
  qc: QueryClient,
  userId: string,
  event: TimelineEventRow,
): Promise<TimelineEventRow> {
  const timelineUserId = resolveTimelineUserId(userId);
  const level = event.level as ScheduleLevel;

  if (backendAvailable) {
    const { data, error } = await supabase
      .from("schedule_events")
      .update({
        title: event.title,
        subtitle: event.subtitle,
        start_time: event.start_time,
        level,
      })
      .eq("id", event.id)
      .eq("user_id", timelineUserId)
      .select("id,title,subtitle,start_time,level")
      .single();
    if (error) throw error;
    const row: TimelineEventRow = {
      id: data.id,
      title: data.title,
      subtitle: data.subtitle,
      start_time: data.start_time,
      level: data.level,
    };
    upsertTodayEventInCache(qc, timelineUserId, row);
    await refreshTodayEventsCache(qc, timelineUserId);
    return row;
  }

  const saved = updateScheduleItem(event.id, {
    title: event.title,
    subtitle: event.subtitle,
    start_time: event.start_time,
    level,
  });
  if (!saved) throw new Error("Event not found");
  const row: TimelineEventRow = {
    id: saved.id,
    title: saved.title,
    subtitle: saved.subtitle ?? null,
    start_time: saved.start_time,
    level: saved.level,
  };
  upsertTodayEventInCache(qc, timelineUserId, row);
  await refreshTodayEventsCache(qc, timelineUserId);
  return row;
}
