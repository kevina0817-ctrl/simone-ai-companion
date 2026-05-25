import { Calendar, Clock, CloudSun, MapPin, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  EVENING_PLAN_TIMEZONE,
  formatZonedTime,
  getZonedClock,
} from "@/lib/boredom-schedule";

const TIME_TICK_MS = 30_000;

function StatusChip({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-card/60 px-3 py-1.5 text-xs text-muted-foreground">
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {children}
    </span>
  );
}

export function HomeStatusChips() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), TIME_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const dateLabel = now.toLocaleDateString("en-CA", {
    timeZone: EVENING_PLAN_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeLabel = formatZonedTime(getZonedClock(now, EVENING_PLAN_TIMEZONE));

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <StatusChip icon={Calendar}>{dateLabel}</StatusChip>
      <StatusChip icon={Clock}>{timeLabel}</StatusChip>
      <StatusChip icon={CloudSun}>18°C Partly cloudy</StatusChip>
      <StatusChip icon={MapPin}>Toronto</StatusChip>
    </div>
  );
}
