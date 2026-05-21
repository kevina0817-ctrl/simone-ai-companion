import type { ReactNode } from "react";
import { Activity, Bell, Coffee, Droplets, Footprints, Gamepad2, Moon } from "lucide-react";
import type { StoredPersonaLifestyle } from "@/lib/persona-registry";

type Props = {
  lifestyle: StoredPersonaLifestyle;
};

export function PersonaLifestyleCard({ lifestyle }: Props) {
  const w = lifestyle.wellness;

  return (
    <div className="mt-5 space-y-3">
      <div className="rounded-3xl bg-card/70 p-5 shadow-card">
        <div className="mb-3 text-sm font-medium">Recovery & body</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Metric label="Recovery" value={w.recovery_score != null ? `${w.recovery_score}%` : "—"} />
          <Metric label="HRV" value={w.hrv_ms != null ? `${w.hrv_ms} ms` : "—"} />
          <Metric label="Stress" value={w.stress_level ?? "—"} />
          <Metric label="Resting HR" value={w.resting_hr != null ? `${w.resting_hr} bpm` : "—"} />
          <Metric icon={<Footprints className="h-3 w-3" />} label="Steps" value={w.steps_today?.toLocaleString() ?? "—"} />
          <Metric icon={<Droplets className="h-3 w-3" />} label="Hydration" value={w.hydration_oz != null ? `${w.hydration_oz} oz` : "—"} />
          <Metric icon={<Coffee className="h-3 w-3" />} label="Caffeine" value={w.caffeine_mg != null ? `${w.caffeine_mg} mg` : "—"} />
          <Metric icon={<Gamepad2 className="h-3 w-3" />} label="Screen time" value={w.screen_time_hours != null ? `${w.screen_time_hours} h` : "—"} />
        </div>
        {w.notes && <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{w.notes}</p>}
      </div>

      {lifestyle.recommendations.length > 0 && (
        <div className="rounded-3xl bg-card/70 p-5 shadow-card">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Activity className="h-4 w-4 text-primary" />
            Simone recommends
          </div>
          <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
            {lifestyle.recommendations.map((r) => (
              <li key={r} className="list-inside list-disc">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {lifestyle.notifications.length > 0 && (
        <div className="rounded-3xl bg-card/70 p-5 shadow-card">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Bell className="h-4 w-4 text-champagne" />
            Notifications
          </div>
          <ul className="space-y-3">
            {lifestyle.notifications.map((n) => (
              <li key={n.id} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
                <div className="text-xs font-medium">{n.title}</div>
                <div className="text-[11px] text-muted-foreground">{n.body}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lifestyle.weekOverview.length > 0 && (
        <div className="rounded-3xl bg-card/70 p-5 shadow-card">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Moon className="h-4 w-4 text-primary" />
            This week
          </div>
          <ul className="space-y-1.5 text-[11px] text-muted-foreground">
            {lifestyle.weekOverview.map((d) => (
              <li key={d.day}>
                <span className="font-medium text-foreground">{d.day}</span> — {d.highlight}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-3xl bg-card/60 p-4 text-[11px] text-muted-foreground">
        <div className="font-medium text-foreground">Meals & habits</div>
        <p className="mt-1">{lifestyle.preferences.meal_style.join(" · ")}</p>
        <p className="mt-1">{lifestyle.preferences.caffeine}</p>
        <p className="mt-1">{lifestyle.preferences.gaming}</p>
        <p className="mt-1">{lifestyle.preferences.groceries}</p>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-secondary/30 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 font-medium capitalize text-foreground">{value}</div>
    </div>
  );
}
