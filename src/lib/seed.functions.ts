import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { jordanRossPersona } from "@/lib/jordan-ross-sample";
import { kevinZhangPersona } from "@/lib/kevin-zhang-sample";
import { nicoleHartPersona } from "@/lib/nicole-hart-sample";
import { resolvePersonaByEmail } from "@/lib/persona-registry";

function emailFromClaims(claims: unknown): string | null {
  if (!claims || typeof claims !== "object") return null;
  const e = (claims as { email?: string }).email;
  return typeof e === "string" ? e : null;
}

// Seeds today's wellness + persona schedule for Supabase users.
export const seedDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const email = emailFromClaims(claims);
    const persona = resolvePersonaByEmail(email) ?? jordanRossPersona;
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const w = persona.wellness;

    await supabase.from("wellness_data").upsert(
      {
        user_id: userId,
        date: todayStr,
        sleep_score: w.sleep_score,
        sleep_duration_min: w.sleep_duration_min,
        readiness_score: w.readiness_score,
      },
      { onConflict: "user_id,date" },
    );

    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    await supabase
      .from("schedule_events")
      .delete()
      .eq("user_id", userId)
      .gte("start_time", startOfDay.toISOString())
      .lte("start_time", endOfDay.toISOString());

    const schedule = persona.scheduleToday();
    await supabase.from("schedule_events").insert(
      schedule.map((e) => ({
        user_id: userId,
        start_time: e.start_time,
        title: e.title,
        subtitle: e.subtitle,
        level: e.level,
      })),
    );

    return { ok: true, persona: persona.id };
  });

export { kevinZhangPersona, jordanRossPersona, nicoleHartPersona };
