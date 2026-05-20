import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { backendAvailable, getDemoEvents, addScheduleItem, removeScheduleItem } from "@/lib/demo-mode";
import {
  parseScheduleFromText,
  parseCancelFromText,
  findScheduleEventForCancel,
  isSameCalendarDay,
  type ScheduleItem,
  type CancelMatchCriteria,
} from "@/lib/schedule-item";

export type ChatScheduleAction =
  | {
      kind: "schedule_event";
      id?: string;
      title: string;
      subtitle?: string | null;
      start_time: string;
      level?: "High" | "Medium" | "Low";
    }
  | {
      kind: "cancel_event";
      id?: string;
      event_id?: string;
      title?: string;
      start_time?: string;
    };

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

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from("schedule_events")
    .select("id,title,subtitle,start_time,level")
    .eq("user_id", userId)
    .gte("start_time", start.toISOString())
    .lte("start_time", end.toISOString())
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
 * Applies schedule/cancel actions from chat to the same store the Homepage reads.
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
      if (backendAvailable) {
        if (!action.id) await insertScheduleClient(item, userId);
      } else {
        addScheduleItem(item);
      }
      scheduled.push(item);
      todayEvents = await fetchTodayTimelineEvents(userId);
    } else if (action.kind === "cancel_event") {
      let removed = await removeFromTimeline(cancelCriteria(action), userId, userMessage, todayEvents);
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
    const cancelCriteria = parseCancelFromText(combinedText);
    if (cancelCriteria) {
      const removed = await removeFromTimeline(cancelCriteria, userId, userMessage, todayEvents);
      if (removed) cancelled.push(removed);
    }
  }

  if (scheduled.length === 0 && cancelled.length === 0) {
    const parsed = parseScheduleFromText(combinedText);
    if (parsed) {
      if (backendAvailable) {
        await insertScheduleClient(parsed, userId);
      } else {
        addScheduleItem(parsed);
      }
      scheduled.push(parsed);
    }
  }

  await qc.invalidateQueries({ queryKey: ["events", userId] });
  await qc.invalidateQueries({ queryKey: ["events", userId, today] });

  return { scheduled, cancelled };
}
