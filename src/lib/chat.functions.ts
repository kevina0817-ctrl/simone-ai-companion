import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeScheduleFromToolArgs } from "@/lib/schedule-item";

const inputSchema = z.object({
  message: z.string().min(1).max(2000),
  timezone: z.string().optional(),
  nowIso: z.string().optional(),
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

When the user asks to book / schedule / add something, CALL schedule_event immediately, then confirm naturally.
When the user asks to cancel / remove / drop / skip a meeting or event, CALL cancel_event with the best match
from the upcoming schedule (by title and/or time), then confirm. If nothing matches, ask which one to cancel.
For other proposed actions (orders, budget changes) without a tool, say you'd add it to their Approvals queue.`;

const tools = [
  {
    type: "function",
    function: {
      name: "schedule_event",
      description: "Add a new event to the user's schedule. Use whenever the user agrees to book or schedule something.",
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
      name: "cancel_event",
      description: "Cancel/remove an event from the user's schedule. Match against the UPCOMING SCHEDULE list shown in context.",
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

    const today = new Date().toISOString().slice(0, 10);
    const [{ data: wellness }, { data: events }, { data: history }] = await Promise.all([
      supabase.from("wellness_data").select("*").eq("user_id", userId).eq("date", today).maybeSingle(),
      supabase
        .from("schedule_events")
        .select("id,start_time,title,subtitle,level")
        .eq("user_id", userId)
        .gte("start_time", new Date().toISOString())
        .order("start_time", { ascending: true })
        .limit(8),
      supabase
        .from("chat_messages")
        .select("role,content")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    const nowIso = data.nowIso ?? new Date().toISOString();
    const tz = data.timezone ?? "UTC";

    const wellnessLine = wellness
      ? `Sleep ${wellness.sleep_score ?? "?"}/100 (${wellness.sleep_duration_min ?? "?"} min), readiness ${wellness.readiness_score ?? "?"}/100.`
      : "No wellness data logged today.";

    const scheduleLines = events && events.length
      ? events
          .map((e) => `- ${new Date(e.start_time).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })} — ${e.title} (${e.level})`)
          .join("\n")
      : "- Nothing scheduled.";

    const contextBlock = [
      `Now: ${new Date(nowIso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} (${tz}).`,
      `Wellness today: ${wellnessLine}`,
      `Upcoming:`,
      scheduleLines,
    ].join("\n");

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: contextBlock },
      ...(history ?? []).reverse().map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const agnicToken = process.env.AGNIC_TOKEN;
    if (!agnicToken) throw new Error("AGNIC_TOKEN is not configured");

    const callGateway = async (msgs: Array<Record<string, unknown>>) => {
      const res = await fetch("https://api.agnic.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Agnic-Token": agnicToken,
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: msgs,
          tools,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        if (res.status === 429) throw new Error("Rate limit reached — try again in a moment.");
        if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
        throw new Error(`AI error: ${text.slice(0, 200)}`);
      }
      return (await res.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
            tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
          };
        }>;
      };
    };

    const actions: Array<
      | {
          kind: "schedule_event";
          id: string;
          title: string;
          subtitle: string | null;
          start_time: string;
          level: "High" | "Medium" | "Low";
        }
      | { kind: "cancel_event"; id: string; title: string }
    > = [];
    let reply = "";

    for (let i = 0; i < 3; i++) {
      const json = await callGateway(messages);
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
              const { data: inserted, error } = await supabase
                .from("schedule_events")
                .insert({
                  user_id: userId,
                  title: item.title,
                  subtitle: item.subtitle,
                  start_time: item.start_time,
                  level: item.level,
                })
                .select()
                .single();
              if (error) throw error;
              result = { ok: true, event: inserted };
              actions.push({
                kind: "schedule_event",
                id: inserted.id,
                title: inserted.title,
                subtitle: inserted.subtitle,
                start_time: inserted.start_time,
                level: inserted.level as "High" | "Medium" | "Low",
              });
            } else if (tc.function.name === "cancel_event") {
              const parsed = z
                .object({
                  event_id: z.string().optional(),
                  title: z.string().optional(),
                  start_time: z.string().optional(),
                })
                .parse(args);

              let target: { id: string; title: string } | null = null;
              if (parsed.event_id) {
                const found = (events ?? []).find((e) => e.id === parsed.event_id);
                if (found) target = { id: found.id, title: found.title };
              }
              if (!target && (parsed.title || parsed.start_time)) {
                const lcTitle = parsed.title?.toLowerCase();
                const startMs = parsed.start_time ? new Date(parsed.start_time).getTime() : null;
                const match = (events ?? []).find((e) => {
                  const titleOk = lcTitle ? e.title.toLowerCase().includes(lcTitle) : true;
                  const timeOk = startMs ? Math.abs(new Date(e.start_time).getTime() - startMs) < 30 * 60 * 1000 : true;
                  return titleOk && timeOk;
                });
                if (match) target = { id: match.id, title: match.title };
              }
              if (!target) throw new Error("No matching upcoming event found");

              const { error } = await supabase
                .from("schedule_events")
                .delete()
                .eq("id", target.id)
                .eq("user_id", userId);
              if (error) throw error;
              result = { ok: true, cancelled: target };
              actions.push({ kind: "cancel_event", id: target.id, title: target.title });
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

    await supabase.from("chat_messages").insert({
      user_id: userId,
      role: "assistant",
      content: reply,
    });

    return { reply, actions };
  });
