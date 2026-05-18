import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway";

const inputSchema = z.object({
  message: z.string().min(1).max(2000),
});

const SYSTEM_PROMPT = `You are Aura, a calm, perceptive AI life assistant in the style of an attentive concierge.
You help the user balance their schedule, wellness, and daily orders.
Be concise (1-3 short sentences), warm, and proactive. Reference their wellness signals when relevant.
If you would take an action (reschedule, place an order, change a budget), say what you would propose,
and tell them you'd add it to their Approvals queue — do NOT claim it's done.`;

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Persist user message
    await supabase.from("chat_messages").insert({
      user_id: userId,
      role: "user",
      content: data.message,
    });

    // Load context: today's wellness + next schedule items + recent messages
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

    const contextBlock = [
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

    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      { role: "system" as const, content: contextBlock },
      ...(history ?? []).reverse().map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("Rate limit reached — try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
      throw new Error(`AI error: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const reply = json.choices?.[0]?.message?.content?.trim() ?? "I'm here.";

    await supabase.from("chat_messages").insert({
      user_id: userId,
      role: "assistant",
      content: reply,
    });

    return { reply };
  });
