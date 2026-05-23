import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { backendAvailable, getDemoEvents, addScheduleItem, removeScheduleItem } from "@/lib/demo-mode";
import { addPendingScheduleApprovals } from "@/lib/approvals-store";
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
  parseStructuredSchedulesFromText,
  parseCancelFromText,
  findScheduleEventForCancel,
  dedupeScheduleEventsByTitle,
  generateScheduleId,
  isValidStructuredScheduleEvent,
  normalizeScheduleEventTitle,
  wantsBulkScheduleApprovals,
  isSameCalendarDay,
  type ScheduleItem,
  type CancelMatchCriteria,
} from "@/lib/schedule-item";
import { resolveScheduleLevel } from "@/lib/schedule-priority";

import {
  coerceBoredomScheduleEvents,
  isEveningPlanIntent,
  userExplicitlyWantsTomorrow,
} from "@/lib/boredom-schedule";
import {
  shouldParseStructuredScheduleFromReply,
  shouldRequireScheduleApproval,
  shouldRunScheduleTextFallbacks,
  shouldSuppressScheduleApprovals,
} from "@/lib/chat-intent";
import type { ChatScheduleAction } from "@/lib/chat-actions";

export type { ChatScheduleAction } from "@/lib/chat-actions";

type ApplyInput = {
  actions?: ChatScheduleAction[];
  userMessage: string;
  assistantReply?: string;
  userId: string;
  /** Client clock — used for evening/boredom planning in America/Toronto. */
  nowIso?: string;
};


function toScheduleItem(action: Extract<ChatScheduleAction, { kind: "schedule_event" }>): ScheduleItem {
  return {
    id: action.id ?? generateScheduleId(),
    title: action.title,
    subtitle: action.subtitle ?? null,
    start_time: new Date(action.start_time).toISOString(),
    end_time: action.end_time ? new Date(action.end_time).toISOString() : undefined,
    level: resolveScheduleLevel(action.level, action.title),
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

function collectScheduleApprovals(
  items: ScheduleItem[],
  byTitle: Map<string, ScheduleItem>,
): void {
  const valid: ScheduleItem[] = [];
  for (const raw of items) {
    const item: ScheduleItem = {
      ...raw,
      id: raw.id || generateScheduleId(),
    };
    if (!isValidStructuredScheduleEvent(item)) continue;
    valid.push(item);
  }
  for (const item of dedupeScheduleEventsByTitle(valid)) {
    const key = normalizeScheduleEventTitle(item.title);
    if (key) byTitle.set(key, item);
  }
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

export type ApplyChatScheduleResult = {
  /** Added straight to Today's Schedule (no Approvals). */
  committed: ScheduleItem[];
  /** Sent to Approvals for review. */
  pendingApproval: ScheduleItem[];
  cancelled: ScheduleItem[];
};

/**
 * Applies schedule tool results: single direct adds → timeline; multi-event / plans → Approvals.
 */
export async function applyChatScheduleResult(
  qc: QueryClient,
  { actions = [], userMessage, assistantReply, userId, nowIso }: ApplyInput,
): Promise<ApplyChatScheduleResult> {
  const cancelled: ScheduleItem[] = [];
  const committed: ScheduleItem[] = [];
  const pendingApproval: ScheduleItem[] = [];
  const byTitle = new Map<string, ScheduleItem>();
  let todayEvents = await fetchTodayTimelineEvents(userId);

  const suppressSchedule = shouldSuppressScheduleApprovals(userMessage);
  const scheduleActions = actions.filter((a) => a.kind === "schedule_event");
  let assistantParsedCount = 0;

  if (!suppressSchedule) {
    collectScheduleApprovals(scheduleActions.map((a) => toScheduleItem(a)), byTitle);

    if (shouldRunScheduleTextFallbacks(userMessage)) {
      if (wantsBulkScheduleApprovals(userMessage)) {
        collectScheduleApprovals(parseStructuredSchedulesFromText(userMessage), byTitle);
      } else if (byTitle.size === 0) {
        const parsed = parseScheduleFromText(userMessage);
        if (parsed) collectScheduleApprovals([parsed], byTitle);
      }
    }

    if (
      assistantReply?.trim() &&
      shouldParseStructuredScheduleFromReply(userMessage, scheduleActions.length)
    ) {
      const fromReply = parseStructuredSchedulesFromText(assistantReply);
      assistantParsedCount = fromReply.length;
      collectScheduleApprovals(fromReply, byTitle);
    }

    let events = [...byTitle.values()].sort(
      (a, b) => +new Date(a.start_time) - +new Date(b.start_time),
    );

    if (
      events.length > 0 &&
      isEveningPlanIntent(userMessage) &&
      !userExplicitlyWantsTomorrow(userMessage)
    ) {
      events = coerceBoredomScheduleEvents(events, {
        nowIso,
        userMessage,
        todayEvents,
      });
    }

    const useApprovals = shouldRequireScheduleApproval(userMessage, events.length, {
      assistantParsedCount,
      toolCallCount: scheduleActions.length,
    });

    if (events.length > 0) {
      if (useApprovals) {
        addPendingScheduleApprovals(events);
        pendingApproval.push(...events);
      } else {
        for (const item of events) {
          const saved = await commitScheduleToTimeline(qc, item, userId);
          committed.push(saved);
        }
      }
    }
  }

  for (const action of actions) {
    if (action.kind === "cancel_event") {
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

  if (cancelled.length === 0) {
    const cancelCriteriaParsed = parseCancelFromText(userMessage);
    if (cancelCriteriaParsed) {
      const removed = await removeFromTimeline(cancelCriteriaParsed, userId, userMessage, todayEvents);
      if (removed) cancelled.push(removed);
    }
  }

  if (cancelled.length > 0) {
    await qc.invalidateQueries({ queryKey: todayQueryKey(userId) });
  }

  return { committed, pendingApproval, cancelled };
}
