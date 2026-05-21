import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { normalizeScheduleFromToolArgs } from "@/lib/schedule-item";
import { normalizeOrderFromToolArgs, type PendingOrder } from "@/lib/pending-order";

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
- schedule_event: add an event to their schedule.
- cancel_event: remove an event from their schedule. Match against UPCOMING SCHEDULE by id/title/time.
- create_pending_order: build a shopping order (title, store, items with name, qty, estimated_price).

When the user asks to buy groceries or order products, CALL create_pending_order.
Do NOT call a tool for general questions or chit-chat.`;

const tools = [
  {
    type: "function",
    function: {
      name: "schedule_event",
      description: "Add a new event to the user's schedule.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          subtitle: { type: "string" },
          start_time: { type: "string", description: "ISO 8601 datetime" },
          level: { type: "string", enum: ["High", "Medium", "Low"] },
        },
        required: ["title", "start_time"],
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
                estimated_price: { type: "number" },
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
      description: "Cancel/remove an event from the UPCOMING SCHEDULE.",
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

export type DemoChatAction =
  | {
      kind: "schedule_event";
      title: string;
      subtitle?: string | null;
      start_time: string;
      level?: "High" | "Medium" | "Low";
    }
  | { kind: "cancel_event"; event_id?: string; title?: string; start_time?: string }
  | { kind: "create_pending_order"; order: PendingOrder };

export const sendDemoChatMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const nowIso = data.nowIso ?? new Date().toISOString();
    const tz = data.timezone ?? "UTC";
    const w = data.wellness;

    const contextBlock = [
      `CURRENT TIME: ${nowIso} (timezone: ${tz})`,
      "",
      "USER WELLNESS TODAY:",
      w
        ? `- Sleep ${w.sleep_score ?? "?"}/100, duration ${w.sleep_duration_min ?? "?"}min, readiness ${w.readiness_score ?? "?"}/100`
        : "- No wellness data logged today",
      "",
      "UPCOMING SCHEDULE:",
      data.events.length
        ? data.events
            .map(
              (e) =>
                `- id=${e.id} | ${new Date(e.start_time).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })} | ${e.title}${e.level ? ` (${e.level})` : ""}`,
            )
            .join("\n")
        : "- No upcoming events",
    ].join("\n");

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: contextBlock },
      ...data.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: data.message },
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        tools,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("Rate limit reached — try again soon.");
      if (res.status === 402) throw new Error("AI credits exhausted.");
      throw new Error(`AI error: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
      }>;
    };

    const msg = json.choices?.[0]?.message;
    const actions: DemoChatAction[] = [];
    const pendingOrders: PendingOrder[] = [];

    if (msg?.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        try {
          const args = JSON.parse(tc.function.arguments || "{}");
          if (tc.function.name === "schedule_event") {
            const item = normalizeScheduleFromToolArgs(args);
            if (item) {
              actions.push({
                kind: "schedule_event",
                title: item.title,
                subtitle: item.subtitle,
                start_time: item.start_time,
                level: item.level,
              });
            }
          } else if (tc.function.name === "create_pending_order") {
            const order = normalizeOrderFromToolArgs(args);
            if (order) {
              actions.push({ kind: "create_pending_order", order });
              pendingOrders.push(order);
            }
          } else if (tc.function.name === "cancel_event") {
            actions.push({
              kind: "cancel_event",
              id: args.event_id ? String(args.event_id) : undefined,
              event_id: args.event_id,
              title: args.title ? String(args.title) : undefined,
              start_time: args.start_time ? String(args.start_time) : undefined,
            });
          }
        } catch {
          // ignore malformed args
        }
      }
    }

    let reply = msg?.content?.trim() ?? "";
    if (!reply) {
      if (actions.some((a) => a.kind === "create_pending_order")) {
        reply = "I've drafted your order — review it under Approvals or Orders.";
      } else if (actions.some((a) => a.kind === "schedule_event")) reply = "Done — added to your schedule.";
      else if (actions.some((a) => a.kind === "cancel_event")) reply = "Done — removed from your schedule.";
      else reply = "Got it.";
    }

    return { reply, actions, pendingOrders };
  });
