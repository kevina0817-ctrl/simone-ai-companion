import {
  getSchedulePriorityStyles,
  resolveScheduleLevel,
  type SchedulePriorityLevel,
} from "@/lib/schedule-priority";

type Props = {
  level?: string;
  title?: string;
  variant?: "dot" | "chip" | "dot-chip";
  className?: string;
};

export function SchedulePriorityIndicator({
  level,
  title,
  variant = "dot",
  className = "",
}: Props) {
  const resolved = resolveScheduleLevel(level, title);
  const styles = getSchedulePriorityStyles(resolved, title);

  if (variant === "dot") {
    return (
      <span
        className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${styles.dot} ring-4 ring-card/60 ${className}`}
        title={`${styles.label} priority`}
        aria-label={`${styles.label} priority`}
      />
    );
  }

  if (variant === "chip") {
    return (
      <span
        className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${styles.chip} ${className}`}
      >
        {resolved}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        className={`h-2 w-2 rounded-full ${styles.dot}`}
        aria-hidden
      />
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${styles.chip}`}>
        {resolved}
      </span>
    </span>
  );
}

export function SchedulePriorityLegend({ className = "" }: { className?: string }) {
  const levels: SchedulePriorityLevel[] = ["High", "Medium", "Low"];
  return (
    <div className={`flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground ${className}`}>
      {levels.map((level) => {
        const styles = getSchedulePriorityStyles(level);
        return (
          <span key={level} className="inline-flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} aria-hidden />
            <span>{styles.label}</span>
          </span>
        );
      })}
    </div>
  );
}
