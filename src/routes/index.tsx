import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Sparkles, Sprout } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MobileFrame } from "@/components/MobileFrame";
import { RingScore } from "@/components/RingScore";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/hooks/useAuth";
import { useResolvedDisplayName } from "@/hooks/useResolvedDisplayName";
import { supabase } from "@/integrations/supabase/client";
import { seedDemoData } from "@/lib/seed.functions";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { HomeCollapsibleSection } from "@/components/HomeCollapsibleSection";
import { HomeStatusChips } from "@/components/HomeStatusChips";
import { useHomeSectionCollapse } from "@/hooks/useHomeSectionCollapse";
import { SchedulePriorityLegend } from "@/components/SchedulePriorityIndicator";
import { TodayScheduleTimeline } from "@/components/TodayScheduleTimeline";
import { loadTodayTimelineEvents, todayQueryKey } from "@/lib/schedule-timeline-cache";
import {
  backendAvailable,
  clearTodayDemoEvents,
  DEMO_EVENTS_CHANGED,
  getDemoInsightForUser,
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

  const displayName = useResolvedDisplayName();
  const homeSections = useHomeSectionCollapse();

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
    if (h < 12) return "Good Morning";
    if (h < 18) return "Good Afternoon";
    return "Good Evening";
  })();

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
              {displayName}
            </h1>
          </div>
          <Link to="/privacy" className="rounded-full bg-card/70 p-2.5">
            <Bell className="h-4 w-4" />
          </Link>
        </div>

        <HomeStatusChips />

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

        <HomeCollapsibleSection
          sectionId="insight"
          sections={homeSections}
          title="Insight for today"
          icon={<Sparkles className="h-4 w-4 text-primary" />}
          className="mt-5"
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            {showWellnessRings && insight
              ? insight
              : "Log today's wellness to unlock personalized insights from Simone."}
          </p>
        </HomeCollapsibleSection>

        {showLifestyle && (
          <PersonaLifestyleCard lifestyle={resolvedLifestyle!} sections={homeSections} />
        )}

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
            <TodayScheduleTimeline events={events ?? []} userId={user!.id} />
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}
