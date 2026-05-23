import type { ScheduleLevel } from "@/lib/schedule-item";
import { isRestOfNightBedtimePlanIntent } from "@/lib/boredom-schedule";

export type SchedulePriorityLevel = ScheduleLevel;

export type SchedulePriorityContext = {
  /** Rest-of-night / tired / bedtime plans — all generated blocks forced to Low (green). */
  eveningLeisurePlan?: boolean;
  /** User message — used to detect bedtime override before title-based rules. */
  userMessage?: string;
  subtitle?: string | null;
};

/** True when tired/bedtime/rest-of-night intent should force Low on every event. */
export function shouldForceLowPriorityForMessage(userMessage?: string): boolean {
  if (!userMessage?.trim()) return false;
  return isRestOfNightBedtimePlanIntent(userMessage);
}

export function buildSchedulePriorityContext(userMessage?: string): SchedulePriorityContext | undefined {
  if (!userMessage?.trim()) return undefined;
  const forceLow = shouldForceLowPriorityForMessage(userMessage);
  return { eveningLeisurePlan: forceLow, userMessage };
}

function shouldForceLowPriority(context?: SchedulePriorityContext): boolean {
  if (!context) return false;
  if (context.eveningLeisurePlan) return true;
  if (context.userMessage && shouldForceLowPriorityForMessage(context.userMessage)) return true;
  return false;
}

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
  return "Low";
}

function eventText(title: string, subtitle?: string | null): string {
  return `${title} ${subtitle ?? ""}`.trim();
}

/** Spending, purchases, or budget impact. */
const HIGH_MONEY =
  /\b(?:buy(?:ing)?|purchase|order(?:ing)?|shop(?:ping)?|grocery|groceries|whole\s+foods|amazon|takeout|take\s+out|food\s+run|ticket|tickets|booking|book\s+tickets|reservation|checkout|budget|spend|paid|payment|\$\d|us\$|ca\$)\b/i;

/** Social / shared plans affecting others (2+ people). */
const HIGH_SOCIAL =
  /\b(?:with\s+friends|friends|friend|group|team|client|customers?|coworkers?|colleagues?|dinner\s+with|lunch\s+with|brunch\s+with|breakfast\s+with|coffee\s+with|date\s+night|together|gathering|party|meetup|meeting|interview|presentation|group\s+workout|workout\s+buddy|sync\s+with|call\s+with|zoom\s+with|family|parents|partner|wedding|baby\s+shower)\b/i;

/** Urgent work / school commitments (still high when time-bound). */
const HIGH_URGENT_WORK =
  /\b(?:exam|deadline|investment\s+committee|due\s+diligence|compliance|legal\s+review|LP\s+call|portfolio\s+company)\b/i;

/** Personal leisure, hobbies, optional entertainment. */
const LOW_LEISURE =
  /\b(?:game|gaming|valorant|league|movie|film|netflix|stream(?:ing)?|tv\b|watch|read(?:ing)?|book\s+club\s+novel|journal|journaling|guitar|piano|hobby|leisure|relax(?:ation)?|meditat(?:e|ion)?|mindfulness|wind-?down|bedtime|skincare|scroll|nap|podcast|music|listen(?:ing)?|tea\s+time|stretch(?:ing)?|breathwork|sauna|cold\s+plunge|evening\s+walk|solo\s+walk|stroll|free\s+time|casual|chill|unwind|yoga|pilates|gentle\s+yoga|light\s+yoga|candlelit)\b/i;

/** Productive but not urgent — solo work, errands, fitness prep. */
const MEDIUM_PRODUCTIVE =
  /\b(?:study|studying|class|lecture|tutorial|assignment|homework|problem\s+set|coursework|errand|productive|productivity|prep(?:aration)?|review\s+deck|deep\s+work|focus\s+block|standup|commute|market\s+prep|gym|fitness|training|conditioning|run(?:ning)?|meal\s+prep|lunch\s+prep|work\s+block|email\s+catch-?up|organize|planning\s+session)\b/i;

function matchesHighPriority(text: string): boolean {
  return HIGH_MONEY.test(text) || HIGH_SOCIAL.test(text) || HIGH_URGENT_WORK.test(text);
}

function matchesLowPriority(text: string): boolean {
  return LOW_LEISURE.test(text);
}

function matchesMediumPriority(text: string): boolean {
  return MEDIUM_PRODUCTIVE.test(text);
}

/**
 * Classify schedule priority for Approvals and Today's Schedule.
 * High: money, social/shared, urgent commitments.
 * Low: leisure/hobbies (default for rest-of-night plans).
 * Medium: only when clearly productive but not urgent.
 */
export function classifySchedulePriority(
  title: string,
  subtitle?: string | null,
  context?: SchedulePriorityContext,
): SchedulePriorityLevel {
  if (shouldForceLowPriority(context)) return "Low";

  const text = eventText(title, subtitle ?? context?.subtitle);
  if (!text) return "Low";

  if (matchesHighPriority(text)) return "High";
  if (matchesLowPriority(text)) return "Low";
  if (matchesMediumPriority(text)) return "Medium";

  return "Low";
}

/** @deprecated Use classifySchedulePriority — title-only wrapper. */
export function inferScheduleLevelFromTitle(title: string): SchedulePriorityLevel {
  return classifySchedulePriority(title);
}

/** Resolve level for display: trust stored High/Medium/Low, else classify from title. */
export function resolveScheduleLevel(
  level: string | undefined,
  title?: string,
  context?: SchedulePriorityContext,
): SchedulePriorityLevel {
  const stored = level?.trim();
  if (stored === "High" || stored === "Medium" || stored === "Low") {
    return stored;
  }
  if (title?.trim()) {
    return classifySchedulePriority(title, context?.subtitle, context);
  }
  return normalizeScheduleLevel(level);
}

export function getSchedulePriorityStyles(
  level: string | undefined,
  title?: string,
  context?: SchedulePriorityContext,
): SchedulePriorityStyles {
  const resolved = resolveScheduleLevel(level, title, context);
  return getSchedulePriorityTheme()[resolved];
}

/** Apply priority rules to a batch of schedule items (e.g. before Approvals). */
export function applySchedulePriorityToItems<T extends { title: string; subtitle?: string | null; level: ScheduleLevel }>(
  items: T[],
  context?: SchedulePriorityContext,
): T[] {
  return items.map((item) => ({
    ...item,
    level: classifySchedulePriority(item.title, item.subtitle, context),
  }));
}
