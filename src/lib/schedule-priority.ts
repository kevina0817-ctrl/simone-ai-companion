import type { ScheduleLevel } from "@/lib/schedule-item";

export type SchedulePriorityLevel = ScheduleLevel;

export type SchedulePriorityStyles = {
  /** Timeline dot / indicator */
  dot: string;
  /** Pill badge */
  chip: string;
  /** Optional left accent on cards */
  accent: string;
  text: string;
  label: string;
};

/** Red / yellow / green mapping — override via setSchedulePriorityTheme for personalization. */
export const DEFAULT_SCHEDULE_PRIORITY_THEME: Record<SchedulePriorityLevel, SchedulePriorityStyles> = {
  High: {
    dot: "bg-risk-high",
    chip: "bg-risk-high/15 text-risk-high",
    accent: "border-l-risk-high",
    text: "text-risk-high",
    label: "High",
  },
  Medium: {
    dot: "bg-risk-medium",
    chip: "bg-risk-medium/15 text-risk-medium",
    accent: "border-l-risk-medium",
    text: "text-risk-medium",
    label: "Medium",
  },
  Low: {
    dot: "bg-success",
    chip: "bg-success/15 text-success",
    accent: "border-l-success",
    text: "text-success",
    label: "Low",
  },
};

let priorityTheme: Record<SchedulePriorityLevel, SchedulePriorityStyles> = {
  ...DEFAULT_SCHEDULE_PRIORITY_THEME,
};

export function getSchedulePriorityTheme(): Record<SchedulePriorityLevel, SchedulePriorityStyles> {
  return priorityTheme;
}

/** Future personalization: pass partial overrides per level. */
export function setSchedulePriorityTheme(
  overrides: Partial<Record<SchedulePriorityLevel, Partial<SchedulePriorityStyles>>>,
): void {
  const levels: SchedulePriorityLevel[] = ["High", "Medium", "Low"];
  const next = { ...priorityTheme };
  for (const level of levels) {
    if (overrides[level]) {
      next[level] = { ...next[level], ...overrides[level] };
    }
  }
  priorityTheme = next;
}

export function normalizeScheduleLevel(level: string | undefined): SchedulePriorityLevel {
  const t = level?.trim();
  if (t === "High" || t === "Medium" || t === "Low") return t;
  return "Medium";
}

const HIGH_TITLE =
  /\b(?:school|class|lecture|tutorial|study|studying|assignment|exam|homework|problem\s+set|coursework|work(?:out)?|gym|fitness|training|pilates|yoga|strength|conditioning|run(?:ning)?|eat(?:ing)?|breakfast|lunch|dinner|meal|food|takeout|protein|nutrition)\b/i;

const LOW_TITLE =
  /\b(?:game|gaming|valorant|league|leisure|relax(?:ation)?|netflix|stream|scroll|wind-?down|sleep\s+prep|bedtime|meditat|skincare|walk|stroll|break\b|free\s+time|hang\s+out|date\s+night)\b/i;

const MEDIUM_TITLE =
  /\b(?:errand|productive|productivity|grocery|groceries|shopping|standup|meeting|call|sync|review|prep|commute|market|portfolio|committee|diligence)\b/i;

/** Infer priority from event title when level is missing or generic. */
export function inferScheduleLevelFromTitle(title: string): SchedulePriorityLevel {
  const t = title.trim();
  if (!t) return "Medium";
  if (HIGH_TITLE.test(t)) return "High";
  if (LOW_TITLE.test(t)) return "Low";
  if (MEDIUM_TITLE.test(t)) return "Medium";
  return "Medium";
}

export function resolveScheduleLevel(
  level: string | undefined,
  title?: string,
): SchedulePriorityLevel {
  const normalized = normalizeScheduleLevel(level);
  if (level?.trim() === "High" || level?.trim() === "Medium" || level?.trim() === "Low") {
    return normalized;
  }
  if (title) return inferScheduleLevelFromTitle(title);
  return normalized;
}

export function getSchedulePriorityStyles(level: string | undefined, title?: string): SchedulePriorityStyles {
  const resolved = resolveScheduleLevel(level, title);
  return getSchedulePriorityTheme()[resolved];
}
