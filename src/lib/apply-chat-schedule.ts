import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { backendAvailable, getDemoEvents, addScheduleItem, removeScheduleItem } from "@/lib/demo-mode";
import { addPendingScheduleApproval } from "@/lib/approvals-store";
import { getLocalCalendarDayBounds } from "@/lib/schedule-context";
import {
  prepareScheduleForToday,
  refreshTodayEventsCache,
  resolveTimelineUserId,
  todayQueryKey,
  upsertTodayEventInCache,
} from "@/lib/schedule-timeline-cache";
import {
  parseScheduleFromText,
  parseCancelFromText,
  findScheduleEventForCancel,
  isSameCalendarDay,
  type ScheduleItem,
  type CancelMatchCriteria,
} from "@/lib/schedule-item";

import type { ChatScheduleAction } from "@/lib/chat-actions";

export type { ChatScheduleAction } from "@/lib/chat-actions";

type ApplyInput = {
  actions?: ChatScheduleAction[];
  userMessage: string;
  assistantReply?: string;
  userId: string;
};

function toScheduleItem(action: Extract<ChatScheduleAction, { kind: "schedule_event" }>): ScheduleItem {
  return {
    id: action.id ?? `schedule-${Date.now()}`,
    title: action.title,
    subtitle: action.subtitle ?? null,
    start_time: new Date(action.start_time).toISOString(),
    level: action.level ?? "Medium",
  };
}

function cancelCriteria(action: Extract<ChatScheduleAction, { kind: "cancel_event" }>): CancelMatchCriteria {
  return {
    id: action.id,
    event_id: action.event_id,
    title: action.title,
    start_time: action.start_time,
  };
}

async function fetchTodayTimelineEvents(userId: string): Promise<ScheduleItem[]> {
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
    .eq("user_id", userId)
    .gte("start_time", startIso)
    .lte("start_time", endIso)
    .order("start_time", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    start_time: row.start_time,
    level: row.level as ScheduleItem["level"],
  }));
}

async function insertScheduleClient(item: ScheduleItem, userId: string) {
  const { error } = await supabase.from("schedule_events").insert({
    user_id: userId,
    title: item.title,
    subtitle: item.subtitle,
    start_time: item.start_time,
    level: item.level,
  });
  if (error) throw error;
}

/** Write an approved event to the Homepage "Today's schedule" (demo or Supabase). */
export async function commitScheduleToTimeline(
  qc: QueryClient,
  item: ScheduleItem,
  userId: string,
): Promise<ScheduleItem> {
  const timelineUserId = resolveTimelineUserId(userId);
  const itemToday = prepareScheduleForToday(item);

  if (backendAvailable) {
    const { data, error } = await supabase
      .from("schedule_events")
      .insert({
        user_id: timelineUserId,
        title: itemToday.title,
        subtitle: itemToday.subtitle,
        start_time: itemToday.start_time,
        level: itemToday.level,
      })
      .select("id,title,subtitle,start_time,level")
      .single();
    if (error) throw error;
    const committed: ScheduleItem = {
      id: data.id,
      title: data.title,
      subtitle: data.subtitle,
      start_time: data.start_time,
      level: data.level as ScheduleItem["level"],
    };
    upsertTodayEventInCache(qc, timelineUserId, committed);
    await refreshTodayEventsCache(qc, timelineUserId);
    return committed;
  }

  const saved = addScheduleItem({
    id: itemToday.id,
    title: itemToday.title,
    subtitle: itemToday.subtitle,
    start_time: itemToday.start_time,
    level: itemToday.level,
  });
  const committed: ScheduleItem = {
    id: saved.id,
    title: saved.title,
    subtitle: saved.subtitle,
    start_time: saved.start_time,
    level: saved.level,
  };
  upsertTodayEventInCache(qc, timelineUserId, committed);
  await refreshTodayEventsCache(qc, timelineUserId);
  return committed;
}

/** Remove from timeline store (no cancelled status in schema/UI). */
async function removeFromTimeline(
  criteria: CancelMatchCriteria,
  userId: string,
  hintText: string,
  todayEvents: ScheduleItem[],
): Promise<ScheduleItem | null> {
  const match = findScheduleEventForCancel(todayEvents, criteria, hintText);
  if (!match) return null;

  if (backendAvailable) {
    const { error } = await supabase
      .from("schedule_events")
      .delete()
      .eq("id", match.id)
      .eq("user_id", userId);
    if (error) throw error;
  } else {
    removeScheduleItem(criteria, hintText);
  }

  return match;
}

/**
 * Queues new events for Approvals; applies cancels immediately on the timeline.
 */
export async function applyChatScheduleResult(
  qc: QueryClient,
  { actions = [], userMessage, assistantReply, userId }: ApplyInput,
): Promise<{ scheduled: ScheduleItem[]; cancelled: ScheduleItem[] }> {
  const scheduled: ScheduleItem[] = [];
  const cancelled: ScheduleItem[] = [];
  const today = new Date().toISOString().slice(0, 10);
  let todayEvents = await fetchTodayTimelineEvents(userId);

  for (const action of actions) {
    if (action.kind === "schedule_event") {
      const item = toScheduleItem(action);
      addPendingScheduleApproval(item);
      scheduled.push(item);
    } else if (action.kind === "cancel_event") {
      const alreadyHandled = Boolean(action.id && backendAvailable);
      let removed = alreadyHandled
        ? todayEvents.find((e) => e.id === action.id) ?? null
        : await removeFromTimeline(cancelCriteria(action), userId, userMessage, todayEvents);

      if (!removed && action.id && action.title) {
        removed = {
          id: action.id,
          title: action.title,
          subtitle: null,
          start_time: action.start_time ?? new Date().toISOString(),
          level: "Medium",
        };
      }
      if (removed) {
        cancelled.push(removed);
        todayEvents = todayEvents.filter((e) => e.id !== removed!.id);
      }
    }
  }

  const combinedText = `${userMessage}\n${assistantReply ?? ""}`;

  if (cancelled.length === 0) {
    const cancelCriteriaParsed = parseCancelFromText(combinedText);
    if (cancelCriteriaParsed) {
      const removed = await removeFromTimeline(cancelCriteriaParsed, userId, userMessage, todayEvents);
      if (removed) cancelled.push(removed);
    }
  }

  if (scheduled.length === 0 && cancelled.length === 0) {
    const parsed = parseScheduleFromText(combinedText);
    const orderIntent = /\b(buy|order|shop for|purchase|groceries|grocery)\b/i.test(combinedText);
    if (parsed && !orderIntent) {
      addPendingScheduleApproval(parsed);
      scheduled.push(parsed);
    }
  }

  if (cancelled.length > 0) {
    await qc.invalidateQueries({ queryKey: ["events", userId] });
    await qc.invalidateQueries({ queryKey: ["events", userId, today] });
  }

  return { scheduled, cancelled };
}
