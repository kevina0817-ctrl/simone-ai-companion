import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Seeds today's wellness data + a sample schedule so the UI feels alive.
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
        sleep_score: 82,
        sleep_duration_min: 7 * 60 + 23,
        readiness_score: 76,
      },
      { onConflict: "user_id,date" },
    );

    // Clear and re-insert today's events
    const startOfDay = new Date(today); startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date(today); endOfDay.setHours(23,59,59,999);
    await supabase
      .from("schedule_events")
      .delete()
      .eq("user_id", userId)
      .gte("start_time", startOfDay.toISOString())
      .lte("start_time", endOfDay.toISOString());

    const at = (h: number, m = 0) => {
      const d = new Date(today); d.setHours(h, m, 0, 0); return d.toISOString();
    };
    await supabase.from("schedule_events").insert([
      { user_id: userId, start_time: at(8, 0), title: "Focus time", subtitle: "Deep work", level: "High" },
      { user_id: userId, start_time: at(10, 30), title: "Client check-in", subtitle: "Zoom meeting", level: "High" },
      { user_id: userId, start_time: at(12, 30), title: "Lunch with Mira", subtitle: "Break", level: "Medium" },
      { user_id: userId, start_time: at(14, 0), title: "Project review", subtitle: "Plan next steps", level: "Medium" },
      { user_id: userId, start_time: at(16, 30), title: "Evening walk", subtitle: "Movement", level: "Low" },
    ]);

    return { ok: true };
  });
