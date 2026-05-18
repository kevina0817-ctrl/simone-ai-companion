import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  message: z.string().min(1).max(2000),
  timezone: z.string().optional(),
  nowIso: z.string().optional(),
});

const SYSTEM_PROMPT = `You are Simone, a calm, perceptive AI life assistant in the style of an attentive concierge.
You help the user balance their schedule, wellness, and daily orders.
Be concise (1-3 short sentences), warm, and proactive. Reference their wellness signals when relevant.

You CAN take real actions using tools:
- schedule_event: add an event to today's (or upcoming) schedule.

When the user asks to book / schedule / add something to their day, CALL the schedule_event tool immediately,
then confirm in one short sentence (e.g. "Done — added a 5:30 PM recovery session.").
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
        .select("start_time,title,subtitle,level")
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

    const contextBlock = [
      `CURRENT TIME: ${nowIso} (user timezone: ${tz})`,
      "",
      "USER WELLNESS TODAY:",
      wellness
        ? `- Sleep score ${wellness.sleep_score ?? "?"}/100, duration ${wellness.sleep_duration_min ?? "?"}min, readiness ${wellness.readiness_score ?? "?"}/100`
        : "- No wellness data logged today",
      "",
      "UPCOMING SCHEDULE:",
      events && events.length
        ? events.map((e) => `- ${new Date(e.start_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}: ${e.title} (${e.level})`).join("\n")
        : "- No upcoming events",
    ].join("\n");

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: contextBlock },
      ...(history ?? []).reverse().map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const callGateway = async (msgs: Array<Record<string, unknown>>) => {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
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

    const actions: Array<{ kind: "schedule_event"; id: string; title: string; start_time: string }> = [];
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
              const parsed = z
                .object({
                  title: z.string().min(1).max(120),
                  subtitle: z.string().max(200).optional(),
                  start_time: z.string().min(1),
                  level: z.enum(["High", "Medium", "Low"]).optional(),
                })
                .parse(args);
              const startDate = new Date(parsed.start_time);
              if (isNaN(startDate.getTime())) throw new Error("Invalid start_time");
              const { data: inserted, error } = await supabase
                .from("schedule_events")
                .insert({
                  user_id: userId,
                  title: parsed.title,
                  subtitle: parsed.subtitle ?? null,
                  start_time: startDate.toISOString(),
                  level: parsed.level ?? "Medium",
                })
                .select()
                .single();
              if (error) throw error;
              result = { ok: true, event: inserted };
              actions.push({ kind: "schedule_event", id: inserted.id, title: inserted.title, start_time: inserted.start_time });
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
