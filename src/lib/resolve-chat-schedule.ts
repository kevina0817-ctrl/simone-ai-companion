import type { ChatScheduleAction } from "@/lib/chat-actions";
import {
  EVENING_PLAN_TIMEZONE,
  coerceBoredomScheduleEvents,
  enforceFoodBedtimeSchedule,
  isEveningPlanIntent,
  isRestOfNightBedtimePlanIntent,
  type FoodBedtimeEnforcementResult,
} from "@/lib/boredom-schedule";
import {
  shouldParseStructuredScheduleFromReply,
  shouldRequireScheduleApproval,
  shouldRunScheduleTextFallbacks,
  shouldSuppressScheduleApprovals,
  isShoppingOrOrderChatIntent,
} from "@/lib/chat-intent";
import {
  buildProposedRoutine,
  proposedRoutineToScheduleItems,
  type ProposedRoutine,
} from "@/lib/proposed-routine";
import { applySchedulePriorityToItems, buildSchedulePriorityContext } from "@/lib/schedule-priority";
import {
  dedupeScheduleEventsByTitle,
  generateScheduleId,
  isValidStructuredScheduleEvent,
  normalizeScheduleEventTitle,
  parseScheduleFromText,
  parseStructuredSchedulesFromText,
  wantsBulkScheduleApprovals,
  type ScheduleItem,
} from "@/lib/schedule-item";

type ScheduleEventAction = Extract<ChatScheduleAction, { kind: "schedule_event" }>;

function toScheduleItemFromAction(
  action: ScheduleEventAction,
  priorityContext?: ReturnType<typeof buildSchedulePriorityContext>,
): ScheduleItem {
  const subtitle = action.subtitle ?? null;
  const base = {
    id: action.id ?? generateScheduleId(),
    title: action.title,
    subtitle,
    start_time: new Date(action.start_time).toISOString(),
    end_time: action.end_time ? new Date(action.end_time).toISOString() : undefined,
    level: "Low" as const,
  };
  return applySchedulePriorityToItems([base], priorityContext ? { ...priorityContext, subtitle } : { subtitle })[0]!;
}

function collectScheduleApprovals(
  items: ScheduleItem[],
  byTitle: Map<string, ScheduleItem>,
): void {
  const valid: ScheduleItem[] = [];
  for (const raw of items) {
    const item: ScheduleItem = { ...raw, id: raw.id || generateScheduleId() };
    if (!isValidStructuredScheduleEvent(item)) continue;
    valid.push(item);
  }
  for (const item of dedupeScheduleEventsByTitle(valid)) {
    const key = normalizeScheduleEventTitle(item.title);
    if (key) byTitle.set(key, item);
  }
}

export type ResolveChatScheduleInput = {
  actions: ChatScheduleAction[];
  userMessage: string;
  assistantReply?: string;
  nowIso?: string;
  todayEvents?: ScheduleItem[];
  /** Do not parse times from assistant prose (tired routine confirm phase). */
  skipAssistantReplyParse?: boolean;
  /** Do not parse times from user message text. */
  skipUserMessageFallbacks?: boolean;
  /** Always run bedtime coercion + ProposedRoutine pipeline. */
  forceRoutinePipeline?: boolean;
};

export type ResolveChatScheduleResult = {
  events: ScheduleItem[];
  proposedRoutine?: ProposedRoutine;
  removedFood: ScheduleItem[];
  foodBedtime?: Pick<FoodBedtimeEnforcementResult, "bedtime" | "foodCutoff">;
  useApprovals: boolean;
};

/**
 * Deterministic schedule resolution (coercion, food rules, routine object).
 * Single source of truth before chat copy and Approvals.
 */
export function resolveChatScheduleEvents(input: ResolveChatScheduleInput): ResolveChatScheduleResult {
  const {
    actions,
    userMessage,
    assistantReply,
    nowIso,
    todayEvents = [],
    skipAssistantReplyParse = false,
    skipUserMessageFallbacks = false,
    forceRoutinePipeline = false,
  } = input;
  const empty: ResolveChatScheduleResult = {
    events: [],
    removedFood: [],
    useApprovals: false,
  };

  if (shouldSuppressScheduleApprovals(userMessage) || isShoppingOrOrderChatIntent(userMessage)) {
    return empty;
  }

  const scheduleActions = actions.filter((a): a is ScheduleEventAction => a.kind === "schedule_event");
  const priorityContext = buildSchedulePriorityContext(userMessage);
  const byTitle = new Map<string, ScheduleItem>();
  let assistantParsedCount = 0;

  collectScheduleApprovals(
    scheduleActions.map((a) => toScheduleItemFromAction(a, priorityContext)),
    byTitle,
  );

  if (!skipUserMessageFallbacks && shouldRunScheduleTextFallbacks(userMessage)) {
    if (wantsBulkScheduleApprovals(userMessage)) {
      collectScheduleApprovals(parseStructuredSchedulesFromText(userMessage), byTitle);
    } else if (byTitle.size === 0) {
      const parsed = parseScheduleFromText(userMessage);
      if (parsed) collectScheduleApprovals([parsed], byTitle);
    }
  }

  if (
    !skipAssistantReplyParse &&
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

  const eveningPlan = priorityContext?.eveningLeisurePlan ?? isEveningPlanIntent(userMessage);

  if (events.length > 0 && eveningPlan) {
    events = coerceBoredomScheduleEvents(events, {
      nowIso,
      userMessage,
      todayEvents,
    });
  }

  const foodEnforced = enforceFoodBedtimeSchedule(events, {
    nowIso,
    userMessage,
    eveningPlan,
  });
  events = foodEnforced.events;
  const removedFood = foodEnforced.removedFood;
  const foodBedtime = { bedtime: foodEnforced.bedtime, foodCutoff: foodEnforced.foodCutoff };

  events = applySchedulePriorityToItems(events, priorityContext);

  const useApprovals = shouldRequireScheduleApproval(userMessage, events.length, {
    assistantParsedCount,
    toolCallCount: scheduleActions.length,
  });

  const useRoutinePipeline =
    events.length > 0 &&
    (forceRoutinePipeline || isRestOfNightBedtimePlanIntent(userMessage) || eveningPlan);

  let proposedRoutine: ProposedRoutine | undefined;
  if (useRoutinePipeline) {
    proposedRoutine = buildProposedRoutine(events, {
      timeZone: EVENING_PLAN_TIMEZONE,
      requiresApproval: useApprovals,
    });
    events = proposedRoutineToScheduleItems(proposedRoutine);
  }

  return { events, proposedRoutine, removedFood, foodBedtime, useApprovals };
}

/** Build schedule_event actions from activity names only — times come from coercion. */
export function buildScheduleActionsFromActivityNames(
  activities: string[],
): Extract<ChatScheduleAction, { kind: "schedule_event" }>[] {
  const startMs = Date.now();
  return activities.map((title, index) => {
    const start = new Date(startMs + index * 60_000).toISOString();
    const end = new Date(startMs + (index + 1) * 60_000).toISOString();
    return {
      kind: "schedule_event",
      title,
      subtitle: "Wind-down",
      start_time: start,
      end_time: end,
      level: "Low" as const,
    };
  });
}

/** Phase 2: deterministic times from a stored routine proposal (no LLM time parsing). */
export function resolveChatScheduleFromRoutineProposal(
  activities: string[],
  opts: {
    userMessage?: string;
    nowIso?: string;
    todayEvents?: ScheduleItem[];
  },
): ResolveChatScheduleResult {
  const confirmMessage =
    opts.userMessage?.trim() && !/^(?:yes|yeah|yep|sure|ok(?:ay)?)[!.?\s]*$/i.test(opts.userMessage.trim())
      ? opts.userMessage.trim()
      : "I'm exhausted — schedule a light wind-down for the 3 hours before bedtime tonight.";

  return resolveChatScheduleEvents({
    actions: buildScheduleActionsFromActivityNames(activities),
    userMessage: confirmMessage,
    nowIso: opts.nowIso,
    todayEvents: opts.todayEvents,
    skipAssistantReplyParse: true,
    skipUserMessageFallbacks: true,
    forceRoutinePipeline: true,
  });
}
