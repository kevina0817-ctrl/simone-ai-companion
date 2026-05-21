import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildJordanRossSchedule, jordanRossWellness } from "@/lib/jordan-ross-sample";

// Seeds today's wellness + Jordan Ross schedule (dense day) for Supabase users.
export const seedDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    await supabase.from("wellness_data").upsert(
      {
        user_id: userId,
        date: todayStr,
        sleep_score: jordanRossWellness.sleep_score,
        sleep_duration_min: jordanRossWellness.sleep_duration_min,
        readiness_score: jordanRossWellness.readiness_score,
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

    const schedule = buildJordanRossSchedule();
    await supabase.from("schedule_events").insert(
      schedule.map((e) => ({
        user_id: userId,
        start_time: e.start_time,
        title: e.title,
        subtitle: e.subtitle,
        level: e.level,
      })),
    );

    return { ok: true };
  });
