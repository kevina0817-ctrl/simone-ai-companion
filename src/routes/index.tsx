import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Calendar, Cloud, Sparkles, Sprout } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MobileFrame } from "@/components/MobileFrame";
import { RingScore } from "@/components/RingScore";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { seedDemoData } from "@/lib/seed.functions";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { ScheduleEventActions } from "@/components/ScheduleEventActions";
import { SchedulePriorityIndicator, SchedulePriorityLegend } from "@/components/SchedulePriorityIndicator";
import { loadTodayTimelineEvents, todayQueryKey } from "@/lib/schedule-timeline-cache";
import {
  backendAvailable,
  clearTodayDemoEvents,
  DEMO_EVENTS_CHANGED,
  getDemoInsightForUser,
  getDemoProfileForUser,
} from "@/lib/demo-mode";
import { PersonaLifestyleCard } from "@/components/PersonaLifestyleCard";
import {
  applyPersonaForUser,
  getHomePersonaLifestyle,
  getReadinessRingMeta,
  getSleepRingMeta,
  resolveHomeWellness,
  resolvePersonaByUser,
  type StoredPersonaLifestyle,
} from "@/lib/persona-registry";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Simone — Your AI life assistant" },
      { name: "description", content: "Simone adapts your schedule, orders, and day to your wellness data." },
    ],
  }),
  component: () => <RequireAuth><Home /></RequireAuth>,
});

function Home() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const seed = useServerFn(seedDemoData);

  const { data: profile } = useQuery({
    queryKey: ["profile", user!.id, user?.email],
    queryFn: async () => {
      const personaProfile = getDemoProfileForUser(user?.email);
      if (!backendAvailable) return personaProfile;
      const { data } = await supabase.from("profiles").select("display_name").eq("id", user!.id).maybeSingle();
      return data?.display_name ? data : personaProfile;
    },
  });

  const today = new Date().toISOString().slice(0, 10);

  const [lifestyle, setLifestyle] = useState<StoredPersonaLifestyle | null>(null);

  useEffect(() => {
    if (!user) return;
    applyPersonaForUser(user);
    setLifestyle(getHomePersonaLifestyle(user.email, user.id));
  }, [user?.id, user?.email]);

  useEffect(() => {
    const refreshTimeline = () => {
      void qc.invalidateQueries({ queryKey: todayQueryKey(user!.id) });
    };
    const refreshWellness = () => {
      void qc.invalidateQueries({ queryKey: ["wellness", user!.id, today] });
      setLifestyle(getHomePersonaLifestyle(user?.email, user?.id));
    };
    window.addEventListener(DEMO_EVENTS_CHANGED, refreshTimeline);
    window.addEventListener("simone-persona-wellness-changed", refreshWellness);
    return () => {
      window.removeEventListener(DEMO_EVENTS_CHANGED, refreshTimeline);
      window.removeEventListener("simone-persona-wellness-changed", refreshWellness);
    };
  }, [qc, user, today]);

  const { data: wellness } = useQuery({
    queryKey: ["wellness", user!.id, today, user?.email],
    placeholderData: () => resolveHomeWellness(user?.email, null) ?? undefined,
    queryFn: async () => {
      if (!backendAvailable) {
        return resolveHomeWellness(user?.email, null);
      }
      const { data } = await supabase
        .from("wellness_data")
        .select("sleep_score, readiness_score, sleep_duration_min")
        .eq("user_id", user!.id)
        .eq("date", today)
        .maybeSingle();
      return resolveHomeWellness(user?.email, data);
    },
  });

  const { data: events } = useQuery({
    queryKey: todayQueryKey(user!.id),
    queryFn: () => loadTodayTimelineEvents(user!.id),
    refetchOnMount: "always",
  });

  const seedM = useMutation({
    mutationFn: async () => {
      if (!backendAvailable) return { ok: true };
      return seed();
    },
    onSuccess: () => {
      toast.success("Demo day loaded");
      qc.invalidateQueries({ queryKey: ["wellness"] });
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const clearTodayM = useMutation({
    mutationFn: async () => {
      if (!backendAvailable) {
        clearTodayDemoEvents();
        return;
      }
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const { error } = await supabase
        .from("schedule_events")
        .delete()
        .eq("user_id", user!.id)
        .gte("start_time", start.toISOString())
        .lte("start_time", end.toISOString());
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Today's schedule cleared");
      void qc.invalidateQueries({ queryKey: ["events", user!.id, today] });
    },
    onError: () => toast.error("Could not clear today's schedule"),
  });

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  const name = profile?.display_name ?? user?.email?.split("@")[0] ?? "friend";
  const persona = resolvePersonaByUser(user);
  const resolvedLifestyle = lifestyle ?? getHomePersonaLifestyle(user?.email, user?.id);
  const insight = resolvedLifestyle?.insight ?? getDemoInsightForUser(user?.email);
  const showLifestyle = Boolean(persona && resolvedLifestyle);
  const sleepRing = getSleepRingMeta(wellness);
  const readinessRing = getReadinessRingMeta(wellness);
  const showWellnessRings = Boolean(wellness?.sleep_score != null || wellness?.readiness_score != null);

  return (
    <MobileFrame>
      <div className="px-5 pt-2">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-light leading-tight">
              {greeting},
              <br />
              {name}
            </h1>
          </div>
          <Link to="/privacy" className="rounded-full bg-card/70 p-2.5">
            <Bell className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-card/60 px-3 py-1.5">
            <Calendar className="h-3 w-3" />
            {new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-card/60 px-3 py-1.5">
            <Cloud className="h-3 w-3" /> 18°C Partly cloudy
          </span>
        </div>

        {!showWellnessRings && (
          <button
            onClick={() => seedM.mutate()}
            disabled={seedM.isPending}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary disabled:opacity-60"
          >
            <Sprout className="h-4 w-4" />
            {seedM.isPending ? "Preparing…" : "Load a sample day"}
          </button>
        )}

        {showWellnessRings && (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <RingScore
              value={sleepRing.value}
              label="Sleep"
              status={sleepRing.status}
              detail={sleepRing.detail}
            />
            <RingScore
              value={readinessRing.value}
              label="Readiness"
              status={readinessRing.status}
              detail={readinessRing.detail}
              color="champagne"
            />
          </div>
        )}

        <div className="mt-5 rounded-3xl bg-card/70 p-5 shadow-card">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            Insight for today
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {showWellnessRings && insight
              ? insight
              : "Log today's wellness to unlock personalized insights from Simone."}
          </p>
        </div>

        {showLifestyle && <PersonaLifestyleCard lifestyle={resolvedLifestyle!} />}

        <div className="mt-6">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl">Today's schedule</h2>
              <SchedulePriorityLegend className="mt-1" />
            </div>
            <div className="flex items-center gap-3">
              {events && events.length > 0 && (
                <button
                  type="button"
                  onClick={() => clearTodayM.mutate()}
                  disabled={clearTodayM.isPending}
                  className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {clearTodayM.isPending ? "Clearing…" : "Clear"}
                </button>
              )}
              <Link to="/chat" className="text-xs text-primary">
                Ask Simone →
              </Link>
            </div>
          </div>

          <div className="relative rounded-3xl bg-card/60 p-4">
            {events && events.length > 0 ? (
              <>
                <div className="absolute left-[42px] top-6 bottom-6 w-px bg-border" />
                <ul className="space-y-4">
                  {events.map((item) => (
                    <li key={item.id} className="relative flex items-center gap-3">
                      <span className="w-12 text-[11px] font-medium text-muted-foreground">
                        {new Date(item.start_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </span>
                      <SchedulePriorityIndicator
                        level={item.level}
                        title={item.title}
                        variant="dot"
                        className="relative z-10"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium leading-tight">{item.title}</div>
                        <div className="text-xs text-muted-foreground">{item.subtitle}</div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <SchedulePriorityIndicator level={item.level} title={item.title} variant="chip" />
                        <ScheduleEventActions event={item} userId={user!.id} />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No events yet. Load a sample day above or ask Simone to plan one.
              </div>
            )}
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}
