import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Calendar, Cloud, Sparkles } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { RingScore } from "@/components/RingScore";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aura — Your AI life assistant" },
      { name: "description", content: "Aura adapts your schedule, orders, and day to your wellness data." },
    ],
  }),
  component: Home,
});

const schedule = [
  { time: "8:00 AM", title: "Focus time", sub: "Deep work", level: "High" },
  { time: "10:30 AM", title: "Client check-in", sub: "Zoom meeting", level: "High" },
  { time: "12:30 PM", title: "Lunch with Mira", sub: "Break", level: "Medium" },
  { time: "2:00 PM", title: "Project review", sub: "Plan next steps", level: "Medium" },
  { time: "4:30 PM", title: "Evening walk", sub: "Movement", level: "Low" },
] as const;

const levelDot: Record<string, string> = {
  High: "bg-primary",
  Medium: "bg-champagne",
  Low: "bg-success",
};
const levelChip: Record<string, string> = {
  High: "bg-primary/15 text-primary",
  Medium: "bg-champagne/15 text-champagne",
  Low: "bg-success/15 text-success",
};

function Home() {
  return (
    <MobileFrame>
      <div className="px-5 pt-2">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-light leading-tight">
              Good morning,
              <br />
              Shanshan
            </h1>
          </div>
          <button className="rounded-full bg-card/70 p-2.5">
            <Bell className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-card/60 px-3 py-1.5">
            <Calendar className="h-3 w-3" /> May 16, 2025
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-card/60 px-3 py-1.5">
            <Cloud className="h-3 w-3" /> 18°C Partly cloudy
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <RingScore value={82} label="Sleep" status="Good" detail="7h 23m" />
          <RingScore value={76} label="Readiness" status="Steady" detail="Aligned" color="champagne" />
        </div>

        <div className="mt-5 rounded-3xl bg-card/70 p-5 shadow-card">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            Insight for today
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            A calm start supports a focused day. Your afternoon looks busy — block a
            15&nbsp;min reset between 1–3&nbsp;PM.
          </p>
        </div>

        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl">Today's schedule</h2>
            <Link to="/chat" className="text-xs text-primary">
              View full day →
            </Link>
          </div>

          <div className="relative rounded-3xl bg-card/60 p-4">
            <div className="absolute left-[42px] top-6 bottom-6 w-px bg-border" />
            <ul className="space-y-4">
              {schedule.map((item) => (
                <li key={item.time} className="relative flex items-center gap-3">
                  <span className="w-12 text-[11px] font-medium text-muted-foreground">
                    {item.time}
                  </span>
                  <span className={`relative z-10 h-2.5 w-2.5 rounded-full ${levelDot[item.level]} ring-4 ring-card/60`} />
                  <div className="flex-1">
                    <div className="text-sm font-medium leading-tight">{item.title}</div>
                    <div className="text-xs text-muted-foreground">{item.sub}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${levelChip[item.level]}`}>
                    {item.level}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}
