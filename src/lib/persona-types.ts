import type { BudgetSettings } from "@/lib/budget-store";
import type { PendingItem } from "@/lib/approvals-store";
import type { DemoEvent, DemoMessage } from "@/lib/demo-mode";
import type { PendingOrder } from "@/lib/pending-order";
import type { User } from "@supabase/supabase-js";

export type PersonaWellness = {
  sleep_score: number;
  readiness_score: number;
  sleep_duration_min: number;
  recovery_score?: number;
  hrv_ms?: number;
  stress_level?: "low" | "moderate" | "high";
  resting_hr?: number;
  steps_today?: number;
  screen_time_hours?: number;
  caffeine_mg?: number;
  hydration_oz?: number;
  notes?: string;
};

export type PersonaNotification = {
  id: string;
  title: string;
  body: string;
  hoursAgo: number;
  kind: "wellness" | "budget" | "study" | "social";
};

export type PersonaLifestylePrefs = {
  meal_style: string[];
  caffeine: string;
  fitness_focus: string[];
  gaming: string;
  groceries: string;
  hydration_goal_oz?: number;
};

export type PersonaBundle = {
  id: string;
  user: User;
  profile: { display_name: string };
  wellness: PersonaWellness;
  insight: string;
  recommendations: string[];
  notifications: PersonaNotification[];
  preferences: PersonaLifestylePrefs;
  budget: BudgetSettings;
  scheduleToday: () => DemoEvent[];
  /** Summaries for Mon–Sun (display only; today uses scheduleToday). */
  weekOverview: { day: string; highlight: string }[];
  orders: () => PendingOrder[];
  approvals: (orders: PendingOrder[]) => PendingItem[];
  chatMessages: () => DemoMessage[];
  seededFlagKey: string;
};
