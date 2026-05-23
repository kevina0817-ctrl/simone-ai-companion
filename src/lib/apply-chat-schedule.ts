import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { backendAvailable, getDemoEvents, addScheduleItem, removeScheduleItem } from "@/lib/demo-mode";
import {
  addPendingRoutineProposal,
  addPendingScheduleApprovals,
  removePendingRoutineProposalApprovals,
} from "@/lib/approvals-store";
import { getLocalCalendarDayBounds } from "@/lib/schedule-context";
import {
  prepareScheduleForToday,
  refreshTodayEventsCache,
  resolveTimelineUserId,
  todayQueryKey,
  upsertTodayEventInCache,
} from "@/lib/schedule-timeline-cache";
import {
  parseCancelFromText,
  findScheduleEventForCancel,
  isSameCalendarDay,
  type ScheduleItem,
  type CancelMatchCriteria,
} from "@/lib/schedule-item";
import type { FoodBedtimeEnforcementResult } from "@/lib/boredom-schedule";
import type { ProposedRoutine } from "@/lib/proposed-routine";
import { resolveChatScheduleEvents } from "@/lib/resolve-chat-schedule";
import {
  isAffirmativeRoutineConfirmText,
  isTiredEveningRoutineProposalRequest,
  shouldSuppressScheduleApprovals,
} from "@/lib/chat-intent";
import type { ChatScheduleAction } from "@/lib/chat-actions";
import type { RoutineProposal } from "@/lib/routine-proposal";
import {
  buildTiredEveningProposalReply,
  buildTiredEveningRoutineProposal,
  buildPhase2RoutineFromProposal,
} from "@/lib/routine-proposal-flow";
import {
  clearPendingRoutineProposal,
  getPendingRoutineProposal,
  setPendingRoutineProposal,
} from "@/lib/routine-proposal-store";

export type { ChatScheduleAction } from "@/lib/chat-actions";

type ApplyInput = {
  actions?: ChatScheduleAction[];
  userMessage: string;
  assistantReply?: string;
  userId: string;
  /** Client clock — used for evening/boredom planning in America/Toronto. */
  nowIso?: string;
  /** Server phase-1 tired routine (no times). */
  routineProposal?: RoutineProposal;
  /** Server already ran phase-2 scheduling. */
  routineScheduleConfirmed?: boolean;
};

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
  /** Food events removed for starting at/after bedtime − 4h. */
  removedFood: ScheduleItem[];
  foodBedtime?: Pick<FoodBedtimeEnforcementResult, "bedtime" | "foodCutoff">;
  /** Canonical bedtime routine — same times in chat and Approvals. */
  proposedRoutine?: ProposedRoutine;
  /** Phase-1 tired routine stored for "sure" / Approvals confirm. */
  routineProposal?: RoutineProposal;
  /** Use this reply instead of raw assistant text (proposal has no times). */
  displayReplyOverride?: string;
};

/**
 * Applies schedule tool results: single direct adds → timeline; multi-event / plans → Approvals.
 */
export async function applyChatScheduleResult(
  qc: QueryClient,
  {
    actions = [],
    userMessage,
    assistantReply,
    userId,
    nowIso,
    routineProposal: serverProposal,
    routineScheduleConfirmed,
  }: ApplyInput,
): Promise<ApplyChatScheduleResult> {
  const cancelled: ScheduleItem[] = [];
  const committed: ScheduleItem[] = [];
  const pendingApproval: ScheduleItem[] = [];
  let removedFood: ScheduleItem[] = [];
  let foodBedtime: ApplyChatScheduleResult["foodBedtime"];
  let proposedRoutine: ProposedRoutine | undefined;
  let routineProposal: RoutineProposal | undefined;
  let displayReplyOverride: string | undefined;
  let todayEvents = await fetchTodayTimelineEvents(userId);

  const pendingStored = getPendingRoutineProposal(userId);
  const isPhase1Tired =
    Boolean(serverProposal) || isTiredEveningRoutineProposalRequest(userMessage);
  const isPhase2Confirm =
    routineScheduleConfirmed ||
    (isAffirmativeRoutineConfirmText(userMessage) && Boolean(pendingStored));

  if (isPhase1Tired && !isPhase2Confirm) {
    routineProposal = serverProposal ?? buildTiredEveningRoutineProposal();
    setPendingRoutineProposal(userId, routineProposal);
    addPendingRoutineProposal(routineProposal);
    displayReplyOverride = buildTiredEveningProposalReply(routineProposal);
    return {
      committed,
      pendingApproval,
      cancelled,
      removedFood,
      foodBedtime,
      proposedRoutine,
      routineProposal,
      displayReplyOverride,
    };
  }

  if (isPhase2Confirm && pendingStored) {
    clearPendingRoutineProposal(userId);
    removePendingRoutineProposalApprovals();

    const { resolved } = buildPhase2RoutineFromProposal(pendingStored, {
      userMessage,
      nowIso,
      todayEvents,
    });

    const { events } = resolved;
    proposedRoutine = resolved.proposedRoutine;
    removedFood = resolved.removedFood;
    foodBedtime = resolved.foodBedtime;

    if (events.length > 0 && resolved.useApprovals) {
      addPendingScheduleApprovals(events);
      pendingApproval.push(...events);
    } else if (events.length > 0) {
      for (const item of events) {
        const saved = await commitScheduleToTimeline(qc, item, userId);
        committed.push(saved);
      }
    }

    return {
      committed,
      pendingApproval,
      cancelled,
      removedFood,
      foodBedtime,
      proposedRoutine,
      routineProposal: undefined,
    };
  }

  if (routineScheduleConfirmed && actions.some((a) => a.kind === "schedule_event")) {
    removePendingRoutineProposalApprovals();
    clearPendingRoutineProposal(userId);

    const resolved = resolveChatScheduleEvents({
      actions,
      userMessage,
      assistantReply,
      nowIso,
      todayEvents,
      skipAssistantReplyParse: true,
      skipUserMessageFallbacks: true,
      forceRoutinePipeline: true,
    });

    const { events } = resolved;
    proposedRoutine = resolved.proposedRoutine;
    removedFood = resolved.removedFood;
    foodBedtime = resolved.foodBedtime;

    if (events.length > 0 && resolved.useApprovals) {
      addPendingScheduleApprovals(events);
      pendingApproval.push(...events);
    } else if (events.length > 0) {
      for (const item of events) {
        const saved = await commitScheduleToTimeline(qc, item, userId);
        committed.push(saved);
      }
    }

    return {
      committed,
      pendingApproval,
      cancelled,
      removedFood,
      foodBedtime,
      proposedRoutine,
      routineProposal: undefined,
    };
  }

  if (!shouldSuppressScheduleApprovals(userMessage)) {
    const skipTextParse = isPhase2Confirm || routineScheduleConfirmed;

    const resolved = resolveChatScheduleEvents({
      actions,
      userMessage,
      assistantReply,
      nowIso,
      todayEvents,
      skipAssistantReplyParse: skipTextParse,
      skipUserMessageFallbacks: skipTextParse,
      forceRoutinePipeline: skipTextParse,
    });

    let { events } = resolved;
    proposedRoutine = resolved.proposedRoutine;
    removedFood = resolved.removedFood;
    foodBedtime = resolved.foodBedtime;

    if (events.length > 0) {
      if (resolved.useApprovals) {
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

  return { committed, pendingApproval, cancelled, removedFood, foodBedtime, proposedRoutine, routineProposal };
}
