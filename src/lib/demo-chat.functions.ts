import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requestChatCompletion } from "@/lib/ai-gateway";
import { normalizeScheduleFromToolArgs } from "@/lib/schedule-item";
import type { ChatAction, ChatResponse } from "@/lib/chat-actions";
import { normalizeOrderFromToolArgs } from "@/lib/pending-order";
import {
  buildBoredomPlanningContextBlock,
  EVENING_PLAN_TIMEZONE,
  isEveningPlanIntent,
  isRestOfNightBedtimePlanIntent,
} from "@/lib/boredom-schedule";
import { applySchedulePriorityToItems, buildSchedulePriorityContext } from "@/lib/schedule-priority";
import { buildScheduleContextBlock } from "@/lib/schedule-context";
import {
  isAffirmativeRoutineConfirmText,
  isTiredEveningRoutineProposalRequest,
  pickSingleOrderForApproval,
  shouldCreateOrderApproval,
  shouldRequireScheduleApproval,
} from "@/lib/chat-intent";
import { buildDeterministicRoutineReply } from "@/lib/proposed-routine";
import { resolveChatScheduleEvents } from "@/lib/resolve-chat-schedule";
import type { ScheduleItem } from "@/lib/schedule-item";
import {
  buildPhase2RoutineFromProposal,
  buildTiredEveningProposalReply,
  buildTiredEveningRoutineProposal,
} from "@/lib/routine-proposal-flow";
import type { RoutineProposal } from "@/lib/routine-proposal";

const DEMO_ROUTINE_KEY = "demo";
const demoPendingRoutine = new Map<string, RoutineProposal>();

const eventSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  start_time: z.string(),
  level: z.enum(["High", "Medium", "Low"]).optional(),
});

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const inputSchema = z.object({
  message: z.string().min(1).max(2000),
  timezone: z.string().optional(),
  nowIso: z.string().optional(),
  history: z.array(messageSchema).max(20).default([]),
  events: z.array(eventSchema).max(20).default([]),
  wellness: z
    .object({
      sleep_score: z.number().nullable().optional(),
      readiness_score: z.number().nullable().optional(),
      sleep_duration_min: z.number().nullable().optional(),
    })
    .optional(),
});

const SYSTEM_PROMPT = `You are Simone, a calm, perceptive AI life concierge.
You help the user balance their schedule, wellness, orders, budget, and daily life.
Be concise (1-3 short sentences), warm, perceptive, and proactive. Reference their wellness signals when relevant.
Answer ANY question intelligently — small talk, advice, planning, recommendations, reflection prompts, summaries of their day, etc.

You CAN take real actions via tools when (and only when) the user clearly asks:
- schedule_event: add one event (title + start_time + end_time ISO). One specific event for today → direct to Today's Schedule; multiple events or full plans → Approvals. For direct adds, confirm it is already scheduled — never say pending approval or "once you confirm".
- cancel_event: remove an event from their schedule. Match against TODAY'S SCHEDULE by id/title/time.
- create_pending_order: build a shopping order (title, store, items with name, qty, estimated_price in USD).

RECOMMENDATION MODE: when the user wants suggestions or multiple options, list them in chat only — do NOT call create_pending_order.
ORDER MODE: only after they pick one item ("I want the…", "buy this one", "second option") call create_pending_order once for that product.
When the user asks to buy a specific product they already chose, ONLY CALL create_pending_order once — never schedule_event.
Do not split product names or prices into fake calendar events.
Never create multiple pending orders for multiple recommended options in one turn.
Order title and item names must be real products only — never assistant filler phrases.
Grocery and Amazon: quote Canadian dollars only (CA$/CAD) — never US$ or USD in chat.
Luxury / other (e.g. Louis Vuitton): quote US dollars only (US$/USD) — never CAD or conversion text in chat.
State each price once; do not repeat price paragraphs.
Do NOT call a tool for general questions or chit-chat.

BOREDOM / EVENING / BEFORE BEDTIME: Use America/Toronto (Eastern). Always assume bedtime 11:00 PM unless the user explicitly names another — never infer bedtime from duration. "N hours before bedtime" = window ending at bedtime (3h → 8:00–11:00 PM, 2h → 9:00–11:00 PM), not now+N hours. Nothing after bedtime. No food within 4h of bedtime. No 12:00 AM–1:00 AM blocks for before-bed requests.
For tired / before-bed routines: call schedule_event per activity; do NOT write times in chat — the app assigns exact times.`;

const tools = [
  {
    type: "function",
    function: {
      name: "schedule_event",
      description:
        "Add one schedule event. Single today adds go direct to timeline; multi-event plans go to Approvals.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          subtitle: { type: "string" },
          start_time: { type: "string", description: "ISO 8601 start datetime" },
          end_time: { type: "string", description: "ISO 8601 end datetime" },
          level: {
            type: "string",
            enum: ["High", "Medium", "Low"],
            description: "High: purchases or social plans. Low: leisure. Medium: solo productive only.",
          },
        },
        required: ["title", "start_time", "end_time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_pending_order",
      description: "Create a pending shopping order for approval.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          store: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                qty: { type: "number" },
                estimated_price: { type: "number", description: "Unit price in USD" },
              },
              required: ["name"],
            },
          },
        },
        required: ["title", "items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_event",
      description: "Cancel/remove an event from TODAY'S SCHEDULE.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string" },
          title: { type: "string" },
          start_time: { type: "string" },
        },
      },
    },
  },
];

function collectActionsFromToolCalls(
  toolCalls: Array<{ function: { name: string; arguments: string } }>,
  userMessage: string,
): { actions: ChatAction[]; pendingOrders: ChatResponse["pendingOrders"] } {
  const actions: ChatAction[] = [];
  const pendingOrders: ChatResponse["pendingOrders"] = [];
  const priorityContext = buildSchedulePriorityContext(userMessage);

  for (const tc of toolCalls) {
    try {
      const args = JSON.parse(tc.function.arguments || "{}");
      if (tc.function.name === "schedule_event") {
        const item = normalizeScheduleFromToolArgs(args, undefined, priorityContext ?? undefined);
        if (item) {
          const [scheduled] = applySchedulePriorityToItems([item], priorityContext ?? undefined);
          const leveled = scheduled ?? item;
          actions.push({
            kind: "schedule_event",
            title: leveled.title,
            subtitle: leveled.subtitle,
            start_time: leveled.start_time,
            end_time: leveled.end_time,
            level: leveled.level,
          });
        }
      } else if (tc.function.name === "create_pending_order" && shouldCreateOrderApproval(userMessage)) {
        const order = normalizeOrderFromToolArgs(args);
        if (order) {
          actions.push({ kind: "create_pending_order", order });
          pendingOrders.push(order);
        }
      } else if (tc.function.name === "cancel_event") {
        actions.push({
          kind: "cancel_event",
          event_id: args.event_id ? String(args.event_id) : undefined,
          title: args.title ? String(args.title) : undefined,
          start_time: args.start_time ? String(args.start_time) : undefined,
        });
      }
    } catch {
      // ignore malformed args
    }
  }

  return { actions, pendingOrders };
}

export const sendDemoChatMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const nowIso = data.nowIso ?? new Date().toISOString();

    if (isTiredEveningRoutineProposalRequest(data.message)) {
      const proposal = buildTiredEveningRoutineProposal();
      demoPendingRoutine.set(DEMO_ROUTINE_KEY, proposal);
      return {
        reply: buildTiredEveningProposalReply(proposal),
        actions: [],
        pendingOrders: [],
        routineProposal: proposal,
      } satisfies ChatResponse;
    }

    const pendingDemoRoutine = demoPendingRoutine.get(DEMO_ROUTINE_KEY);
    if (pendingDemoRoutine && isAffirmativeRoutineConfirmText(data.message)) {
      demoPendingRoutine.delete(DEMO_ROUTINE_KEY);
      const todaySchedule: ScheduleItem[] = data.events.map((e) => ({
        id: e.id,
        title: e.title,
        subtitle: e.subtitle ?? null,
        start_time: e.start_time,
        level: (e.level ?? "Low") as ScheduleItem["level"],
      }));
      const phase2 = buildPhase2RoutineFromProposal(pendingDemoRoutine, {
        userMessage: data.message,
        nowIso,
        todayEvents: todaySchedule,
      });
      return {
        reply: phase2.reply,
        actions: phase2.actions,
        pendingOrders: [],
        routineScheduleConfirmed: true,
      } satisfies ChatResponse;
    }

    const tz = isRestOfNightBedtimePlanIntent(data.message)
      ? EVENING_PLAN_TIMEZONE
      : (data.timezone ?? "UTC");
    const w = data.wellness;

    const wellnessLine = w
      ? `Sleep ${w.sleep_score ?? "?"}/100 (${w.sleep_duration_min ?? "?"} min), readiness ${w.readiness_score ?? "?"}/100.`
      : "No wellness data logged today.";

    const contextBlock = buildScheduleContextBlock({
      nowIso,
      timezone: tz,
      wellnessLine,
      events: data.events,
      heading: "Today's schedule",
    });

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: contextBlock },
      ...(isRestOfNightBedtimePlanIntent(data.message)
        ? [
            {
              role: "system",
              content: buildBoredomPlanningContextBlock({
                nowIso,
                events: data.events,
                userMessage: data.message,
              }),
            },
          ]
        : []),
      ...data.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: data.message },
    ];

    const actions: ChatAction[] = [];
    const pendingOrders: ChatResponse["pendingOrders"] = [];
    let reply = "";

    const todaySchedule: ScheduleItem[] = data.events.map((e) => ({
      id: e.id,
      title: e.title,
      subtitle: e.subtitle ?? null,
      start_time: e.start_time,
      level: "Low" as const,
    }));

    const tryDeterministicBedtimeReply = (llmDraft?: string | null): boolean => {
      if (isTiredEveningRoutineProposalRequest(data.message)) return false;
      if (!isRestOfNightBedtimePlanIntent(data.message)) return false;
      if (!actions.some((a) => a.kind === "schedule_event")) return false;

      const resolved = resolveChatScheduleEvents({
        actions,
        userMessage: data.message,
        assistantReply: llmDraft ?? undefined,
        nowIso,
        todayEvents: todaySchedule,
      });

      if (!resolved.proposedRoutine) return false;

      reply = buildDeterministicRoutineReply(resolved.proposedRoutine, llmDraft ?? undefined);
      return true;
    };

    for (let i = 0; i < 3; i++) {
      const json = await requestChatCompletion(messages, tools);
      const msg = json.choices?.[0]?.message;
      if (!msg) break;

      if (msg.tool_calls?.length) {
        const collected = collectActionsFromToolCalls(msg.tool_calls, data.message);
        actions.push(...collected.actions);
        pendingOrders.push(...collected.pendingOrders);

        messages.push({
          role: "assistant",
          content: msg.content ?? "",
          tool_calls: msg.tool_calls,
        });
        for (const tc of msg.tool_calls) {
          let toolPayload: Record<string, unknown> = { ok: true };
          try {
            const args = JSON.parse(tc.function.arguments || "{}");
            if (tc.function.name === "schedule_event") {
              const item = normalizeScheduleFromToolArgs(args);
              if (item) {
                const needsApproval = shouldRequireScheduleApproval(data.message, 1, {
                  toolCallCount: 1,
                });
                toolPayload = needsApproval
                  ? { ok: true, pending_approval: true, event: item }
                  : {
                      ok: true,
                      added_to_today_schedule: true,
                      message:
                        "Event is already on today's schedule (no Approvals). Confirm directly.",
                      event: item,
                    };
              }
            }
          } catch {
            // keep { ok: true }
          }
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(toolPayload),
          });
        }

        if (tryDeterministicBedtimeReply(msg.content ?? undefined)) {
          break;
        }
        continue;
      }

      reply = msg.content?.trim() ?? "";
      break;
    }

    if (
      !isTiredEveningRoutineProposalRequest(data.message) &&
      isRestOfNightBedtimePlanIntent(data.message) &&
      actions.some((a) => a.kind === "schedule_event")
    ) {
      tryDeterministicBedtimeReply(reply);
    }

    if (!reply) {
      if (actions.some((a) => a.kind === "create_pending_order")) {
        reply = "I've drafted your order — review it under Approvals or Orders.";
      } else if (actions.some((a) => a.kind === "schedule_event")) reply = "Done — added to your schedule.";
      else if (actions.some((a) => a.kind === "cancel_event")) reply = "Done — removed from your schedule.";
      else reply = "Got it.";
    }

    const ordersForApproval = shouldCreateOrderApproval(data.message)
      ? pickSingleOrderForApproval(data.message, pendingOrders)
      : [];

    return { reply, actions, pendingOrders: ordersForApproval } satisfies ChatResponse;
  });
