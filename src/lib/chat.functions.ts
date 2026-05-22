import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requestChatCompletion } from "@/lib/ai-gateway";
import { normalizeScheduleFromToolArgs, findScheduleEventForCancel } from "@/lib/schedule-item";
import type { ChatAction, ChatResponse } from "@/lib/chat-actions";
import { applyChatCurrencyToReply, collectUsdOrdersFromChatResult } from "@/lib/chat-order-currency";
import { normalizeOrderFromToolArgs } from "@/lib/pending-order";
import { buildScheduleContextBlock } from "@/lib/schedule-context";
import {
  pickSingleOrderForApproval,
  shouldCreateOrderApproval,
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

When the user asks to book / schedule / move / reschedule a calendar event, CALL schedule_event (Approvals first; after approve it appears on today's schedule).
For weekend plans or itineraries ONLY when they ask to schedule events: call schedule_event once per activity with a specific title and start_time — never one event named "these events" or "all events".
When the user asks to add all events to Approvals, call schedule_event for each listed activity.
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
        "Add one event to Approvals. Call separately for each activity in a plan. Title must name the activity (e.g. 'Farmers market'), not 'these events'.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short event title, e.g. 'Recovery session'" },
          subtitle: { type: "string", description: "Optional short detail, e.g. 'Sauna + cold plunge'" },
          start_time: { type: "string", description: "ISO 8601 datetime with timezone offset, e.g. 2026-05-18T17:30:00-07:00" },
          level: { type: "string", enum: ["High", "Medium", "Low"], description: "Priority level, default Medium" },
        },
        required: ["title", "start_time"],
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
    const tz = data.timezone ?? "UTC";
    const ref = new Date(nowIso);
    const dayStartIso =
      data.dayStartIso ??
      (() => {
        const s = new Date(ref);
        s.setHours(0, 0, 0, 0);
        return s.toISOString();
      })();
    const dayEndIso =
      data.dayEndIso ??
      (() => {
        const e = new Date(ref);
        e.setHours(23, 59, 59, 999);
        return e.toISOString();
      })();
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
              const item = normalizeScheduleFromToolArgs(args);
              if (!item) throw new Error("Invalid schedule fields");
              result = { ok: true, pending_approval: true, event: item };
              actions.push({
                kind: "schedule_event",
                title: item.title,
                subtitle: item.subtitle,
                start_time: item.start_time,
                level: item.level,
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
