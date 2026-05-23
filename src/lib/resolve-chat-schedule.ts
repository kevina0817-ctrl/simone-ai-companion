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
  const { actions, userMessage, assistantReply, nowIso, todayEvents = [] } = input;
  const empty: ResolveChatScheduleResult = {
    events: [],
    removedFood: [],
    useApprovals: false,
  };

  if (shouldSuppressScheduleApprovals(userMessage)) return empty;

  const scheduleActions = actions.filter((a): a is ScheduleEventAction => a.kind === "schedule_event");
  const priorityContext = buildSchedulePriorityContext(userMessage);
  const byTitle = new Map<string, ScheduleItem>();
  let assistantParsedCount = 0;

  collectScheduleApprovals(
    scheduleActions.map((a) => toScheduleItemFromAction(a, priorityContext)),
    byTitle,
  );

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
    events.length > 0 && (isRestOfNightBedtimePlanIntent(userMessage) || eveningPlan);

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
