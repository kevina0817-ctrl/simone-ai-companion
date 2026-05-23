import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requestChatCompletion } from "@/lib/ai-gateway";
import { normalizeScheduleFromToolArgs, findScheduleEventForCancel } from "@/lib/schedule-item";
import type { ChatAction, ChatResponse } from "@/lib/chat-actions";
import { applyChatCurrencyToReply, collectUsdOrdersFromChatResult } from "@/lib/chat-order-currency";
import { normalizeOrderFromToolArgs } from "@/lib/pending-order";
import {
  buildBoredomPlanningContextBlock,
  EVENING_PLAN_TIMEZONE,
  getTorontoCalendarDayBounds,
  isEveningPlanIntent,
  isRestOfNightBedtimePlanIntent,
} from "@/lib/boredom-schedule";
import { applySchedulePriorityToItems, buildSchedulePriorityContext } from "@/lib/schedule-priority";
import { buildScheduleContextBlock } from "@/lib/schedule-context";
import {
  pickSingleOrderForApproval,
  shouldCreateOrderApproval,
  shouldRequireScheduleApproval,
} from "@/lib/chat-intent";

const inputSchema = z.object({
  message: z.string().min(1).max(2000),
  timezone: z.string().optional(),
  nowIso: z.string().optional(),
  dayStartIso: z.string().optional(),
  dayEndIso: z.string().optional(),
});

const SYSTEM_PROMPT = `You are Simone, a calm, perceptive AI life assistant in the style of an attentive concierge.
You help the user balance their schedule, wellness, and daily orders.
Be warm, thoughtful, and proactive. Reference the user's wellness signals and upcoming schedule when relevant.
Answer with as much depth as the question requires — a quick check-in can be a sentence, but planning, advice,
or wellness discussions should be as thorough and specific as needed. Use short paragraphs or bullet lists
when it helps clarity. Avoid filler and repetition.

You CAN take real actions using tools:
- schedule_event: add an event to the user's schedule.
- cancel_event: remove an event from the user's schedule when they ask to cancel, remove, drop, skip, or delete it.
- create_pending_order: create a grocery or shopping order for user approval (not charged until they approve).

SINGLE EVENT (direct to Today's Schedule): When the user asks to add/book/schedule ONE specific event for today (e.g. "Add gym at 7 PM today"), call schedule_event once — it is added directly to Today's Schedule with NO Approvals step. Confirm it is already on their schedule; NEVER say pending approval, awaiting confirmation, or "once you confirm".
MULTI-EVENT / PLANS (Approvals): For full-day plans, adjusted schedules with multiple activities, weekend itineraries, or when they ask to add events to Approvals — call schedule_event once per activity; each goes to Approvals first. Only then mention Approvals or confirmation.
When the schedule_event tool returns added_to_today_schedule: true, the event is already live — use past-tense direct confirmation only.
When the tool returns pending_approval: true, the event is waiting in Approvals — you may mention reviewing or confirming there.
Each schedule_event must include title, start_time, and end_time as ISO datetimes (real start/end of the block).
Schedule priority: High = spending, shopping, or events with others (meetings, dinner with friends, group plans). Low = hobbies, relaxation, entertainment. Medium = solo productive blocks only — do not use Medium for casual evening leisure. If the user is tired or planning before bedtime / rest of tonight, set level to Low for every activity.
BOREDOM / EVENING ACTIVITIES: When the user is bored, asks what to do tonight, or wants a plan from now until sleep/bedtime — use America/Toronto (Eastern Time) from the planning context. Schedule ONLY for TODAY from the next quarter-hour after NOW until 11:00 PM bedtime (never 12:00 AM–1:00 AM blocks unless they explicitly ask to stay up late). Example: if now is 7:05 PM Eastern, first block starts 7:15 PM — NOT midnight. Keep plans realistic and healthy; if it is almost bedtime, suggest only 1–2 light wind-down activities.
When suggesting a daily plan in chat only (no request to book), do NOT call schedule_event — use structured lines: "Title — 8:00 AM - 9:00 AM".
For weekend plans with multiple activities they want queued: call schedule_event separately per activity — never one event named "these events".
When the user asks to add all events to Approvals, call schedule_event separately for each activity with title, start_time, and end_time.
When the user asks to cancel / remove / drop / skip a meeting or event, CALL cancel_event with the best match
from today's schedule (use event id when shown, or title and/or time), then confirm. If nothing matches, ask which one to cancel.
RECOMMENDATION MODE vs ORDER MODE:
- When the user asks for suggestions, options, comparisons, or "what do you recommend" — stay in RECOMMENDATION MODE: list products in chat only. Do NOT call create_pending_order. Do not say items were sent to Approvals.
- ORDER MODE — only after the user explicitly picks ONE product (e.g. "I want the Tiffany Pearl Necklace", "buy this one", "add the second option"): call create_pending_order exactly ONCE for that single product.
When the user asks to buy, order, purchase, or shop for a specific product they already named — ONLY CALL create_pending_order once (never schedule_event).
Do not turn product descriptions, prices, or shopping lists into calendar events.
Never call create_pending_order multiple times for multiple recommended options in the same turn.
For create_pending_order: title and item names must be real product names only (e.g. "Tiffany & Co. Pearl Necklace") — never conversational phrases like "for this item" or "let me know if you need assistance".
When the user asks to buy groceries with a clear list — CALL create_pending_order once with title, store, and line items
(name, qty, estimated_price in USD). Then confirm it was sent to their Approvals queue.
Always quote tool prices in US dollars (e.g. "approximately US$950") — never label unconverted estimates as CAD.
For luxury / non-grocery / non-Amazon orders, you may note that CAD conversion happens when they approve.
If the purchase might exceed their monthly budget, still call create_pending_order — it goes to Approvals; budget is checked only when they approve.
For budget-only alerts without specific items, say you'd add it to their Approvals queue.`;

const tools = [
  {
    type: "function",
    function: {
      name: "schedule_event",
      description:
        "Add one schedule event. Single direct adds (e.g. gym at 7 PM today) go to Today's Schedule; multi-event plans go to Approvals.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short event title only, e.g. 'Pilates' or 'Healthy Lunch'" },
          subtitle: { type: "string", description: "Optional short detail, e.g. 'Sauna + cold plunge'" },
          start_time: { type: "string", description: "ISO 8601 start datetime with timezone offset" },
          end_time: { type: "string", description: "ISO 8601 end datetime with timezone offset (after start_time)" },
          level: {
            type: "string",
            enum: ["High", "Medium", "Low"],
            description:
              "High: purchases, budget, or social plans with others. Low: leisure/hobbies. Medium: solo productive work only. Rest-of-night plans: always Low.",
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
      description:
        "Create a pending shopping order for user approval. Use when they want to buy groceries or order products.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description:
              "Real product name only (e.g. Tiffany & Co. Pearl Necklace). Never assistant filler or phrases like 'for this item' or 'need further assistance'.",
          },
          store: { type: "string", description: "Store name, e.g. Whole Foods or Amazon" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Line item product name only — same rules as order title",
                },
                qty: { type: "number" },
                estimated_price: { type: "number", description: "Unit price USD" },
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
      description: "Cancel/remove an event from the user's schedule. Match against TODAY'S SCHEDULE list shown in context (use event_id when available).",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "Optional exact event id if known" },
          title: { type: "string", description: "Title of the event to cancel (fuzzy match allowed)" },
          start_time: { type: "string", description: "Optional ISO 8601 start time to disambiguate" },
        },
      },
    },
  },
];

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    await supabase.from("chat_messages").insert({
      user_id: userId,
      role: "user",
      content: data.message,
    });

    const nowIso = data.nowIso ?? new Date().toISOString();
    const eveningPlan = isRestOfNightBedtimePlanIntent(data.message);
    const priorityContext = buildSchedulePriorityContext(data.message);
    const tz = eveningPlan ? EVENING_PLAN_TIMEZONE : (data.timezone ?? "UTC");
    const ref = new Date(nowIso);
    const torontoDay = getTorontoCalendarDayBounds(ref);
    const dayStartIso =
      data.dayStartIso ??
      (eveningPlan ? torontoDay.startIso : (() => {
        const s = new Date(ref);
        s.setHours(0, 0, 0, 0);
        return s.toISOString();
      })());
    const dayEndIso =
      data.dayEndIso ??
      (eveningPlan ? torontoDay.endIso : (() => {
        const e = new Date(ref);
        e.setHours(23, 59, 59, 999);
        return e.toISOString();
      })());
    const today = dayStartIso.slice(0, 10);

    const fetchTodayEvents = async () => {
      const { data: rows, error } = await supabase
        .from("schedule_events")
        .select("id,start_time,title,subtitle,level")
        .eq("user_id", userId)
        .gte("start_time", dayStartIso)
        .lte("start_time", dayEndIso)
        .order("start_time", { ascending: true });
      if (error) throw error;
      return rows ?? [];
    };

    const [{ data: wellness }, events, { data: history }] = await Promise.all([
      supabase.from("wellness_data").select("*").eq("user_id", userId).eq("date", today).maybeSingle(),
      fetchTodayEvents(),
      supabase
        .from("chat_messages")
        .select("role,content")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    const wellnessLine = wellness
      ? `Sleep ${wellness.sleep_score ?? "?"}/100 (${wellness.sleep_duration_min ?? "?"} min), readiness ${wellness.readiness_score ?? "?"}/100.`
      : "No wellness data logged today.";

    const contextBlock = buildScheduleContextBlock({
      nowIso,
      timezone: tz,
      wellnessLine,
      events,
      heading: "Today's schedule",
    });

    const thread = (history ?? []).reverse().map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    const last = thread[thread.length - 1];
    if (last?.role !== "user" || last.content !== data.message) {
      thread.push({ role: "user", content: data.message });
    }

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: contextBlock },
      ...(isEveningPlanIntent(data.message)
        ? [
            {
              role: "system",
              content: buildBoredomPlanningContextBlock({
                nowIso,
                events,
                userMessage: data.message,
              }),
            },
          ]
        : []),
      ...thread,
    ];

    const actions: ChatAction[] = [];
    const pendingOrders: ChatResponse["pendingOrders"] = [];
    let reply = "";

    let todayEvents = events;

    for (let i = 0; i < 3; i++) {
      const json = await requestChatCompletion(messages, tools);
      const msg = json.choices?.[0]?.message;
      if (!msg) break;

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        messages.push({
          role: "assistant",
          content: msg.content ?? "",
          tool_calls: msg.tool_calls,
        });
        for (const tc of msg.tool_calls) {
          let result: Record<string, unknown> = { ok: false, error: "Unknown tool" };
          try {
            const args = JSON.parse(tc.function.arguments || "{}");
            if (tc.function.name === "schedule_event") {
              const item = normalizeScheduleFromToolArgs(args, undefined, priorityContext ?? undefined);
              if (!item) throw new Error("Invalid schedule fields");
              const [leveled] = applySchedulePriorityToItems([item], priorityContext ?? undefined);
              const scheduled = leveled ?? item;
              const needsApproval = shouldRequireScheduleApproval(data.message, 1, {
                toolCallCount: 1,
              });
              result = needsApproval
                ? { ok: true, pending_approval: true, event: scheduled }
                : {
                    ok: true,
                    added_to_today_schedule: true,
                    message:
                      "Event is already on today's schedule (no Approvals). Confirm directly to the user.",
                    event: scheduled,
                  };
              actions.push({
                kind: "schedule_event",
                title: scheduled.title,
                subtitle: scheduled.subtitle,
                start_time: scheduled.start_time,
                end_time: scheduled.end_time,
                level: scheduled.level,
              });
            } else if (tc.function.name === "cancel_event") {
              const parsed = z
                .object({
                  event_id: z.string().optional(),
                  title: z.string().optional(),
                  start_time: z.string().optional(),
                })
                .parse(args);

              const match = findScheduleEventForCancel(todayEvents, {
                event_id: parsed.event_id,
                title: parsed.title,
                start_time: parsed.start_time,
              });
              if (!match) throw new Error("No matching event on today's schedule");

              const { error } = await supabase
                .from("schedule_events")
                .delete()
                .eq("id", match.id)
                .eq("user_id", userId);
              if (error) throw error;
              result = { ok: true, cancelled: { id: match.id, title: match.title } };
              actions.push({ kind: "cancel_event", id: match.id, title: match.title });
              todayEvents = todayEvents.filter((e) => e.id !== match.id);
            } else if (tc.function.name === "create_pending_order") {
              if (!shouldCreateOrderApproval(data.message)) {
                result = {
                  ok: false,
                  error:
                    "Recommendation mode — describe options in chat only; call create_pending_order after the user picks one item",
                };
              } else {
                const order = normalizeOrderFromToolArgs(args);
                if (!order) {
                  result = {
                    ok: false,
                    error: "Invalid order — use real product names only, not assistant filler text",
                  };
                } else {
                  result = { ok: true, orderId: order.id, itemCount: order.items.length };
                  pendingOrders.push(order);
                  actions.push({
                    kind: "create_pending_order",
                    orderId: order.id,
                    title: order.title,
                  });
                }
              }
            }
          } catch (e) {
            result = { ok: false, error: e instanceof Error ? e.message : "Tool failed" };
          }
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
        }
        continue;
      }

      reply = msg.content?.trim() ?? "Done.";
      break;
    }

    if (!reply) reply = "Done.";

    const ordersForApproval = shouldCreateOrderApproval(data.message)
      ? pickSingleOrderForApproval(data.message, pendingOrders)
      : [];

    const usdOrders = collectUsdOrdersFromChatResult({
      pendingOrders: ordersForApproval,
      actions,
    });
    reply = applyChatCurrencyToReply(reply, usdOrders);

    await supabase.from("chat_messages").insert({
      user_id: userId,
      role: "assistant",
      content: reply,
    });

    return { reply, actions, pendingOrders: ordersForApproval } satisfies ChatResponse;
  });

export const clearChatHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("chat_messages").delete().eq("user_id", userId);
    if (error) throw error;
    return { ok: true as const };
  });
