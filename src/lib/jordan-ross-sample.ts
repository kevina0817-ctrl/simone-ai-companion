import type { User } from "@supabase/supabase-js";
import type { BudgetSettings } from "@/lib/budget-store";
import type { PendingItem } from "@/lib/approvals-store";
import type { DemoEvent } from "@/lib/demo-mode";
import type { PendingOrder } from "@/lib/pending-order";
import { computeOrderTotal } from "@/lib/pending-order";
import type { PersonaBundle, PersonaNotification, PersonaWellness } from "@/lib/persona-types";

export const JORDAN_ROSS_EMAIL = "jordanross@wolfcapital.ai";
export const JORDAN_ROSS_ID = "demo-jordan-ross";
const SEEDED_FLAG = "simone-jordan-ross-seeded";

export const jordanRossUser = {
  id: JORDAN_ROSS_ID,
  aud: "authenticated",
  role: "authenticated",
  email: JORDAN_ROSS_EMAIL,
  app_metadata: {},
  user_metadata: { display_name: "Jordan Ross" },
  created_at: "2026-05-18T00:00:00.000Z",
} as User;

export const jordanRossProfile = { display_name: "Jordan Ross" };

export const jordanRossWellness: PersonaWellness = {
  sleep_score: 88,
  readiness_score: 92,
  sleep_duration_min: 402,
  recovery_score: 89,
  hrv_ms: 68,
  stress_level: "low",
  resting_hr: 52,
  steps_today: 11840,
  screen_time_hours: 2.8,
  caffeine_mg: 95,
  hydration_oz: 84,
  notes: "Strong recovery after early gym and cold plunge. Protect evening focus before dinner date.",
};

export const jordanRossInsight =
  "You're in peak readiness for a dense deal day. Protect the 6 AM gym block, stack recovery before your dinner date, and keep Whole Foods runs predictable — your last three trips averaged about $300.";

export const jordanRossRecommendations = [
  "Keep the 6:00 AM gym block — HRV supports heavy compound work before market open.",
  "Approve today's Whole Foods restock (~$298) before leaving for the IC prep block.",
  "15-minute walk between 1–3 PM before portfolio sync — clears cortisol from back-to-back calls.",
  "Cold plunge after gym tomorrow if sleep stays above 85 — recovery score has room to climb.",
];

export const jordanRossNotifications: PersonaNotification[] = [
  {
    id: "jr-n1",
    title: "Readiness in top 10% this week",
    body: "Sleep 88 · readiness 92 · recovery 89%. You're primed for the IC review at 8:30 AM.",
    hoursAgo: 1,
    kind: "wellness",
  },
  {
    id: "jr-n2",
    title: "Whole Foods order awaiting approval",
    body: "Usual ~$300 organic haul · salmon, greens, supplements · fits monthly grocery cap.",
    hoursAgo: 4,
    kind: "budget",
  },
  {
    id: "jr-n3",
    title: "LP call at 10:00 AM",
    body: "Zoom link ready · deck v4 attached · block 9:30–9:55 for final skim.",
    hoursAgo: 6,
    kind: "study",
  },
  {
    id: "jr-n4",
    title: "Dinner reservation confirmed",
    body: "Alo · 7:00 PM · leave desk by 6:15 PM for a calm transition.",
    hoursAgo: 3,
    kind: "social",
  },
];

export const jordanRossWeekOverview = [
  { day: "Mon", highlight: "6 AM gym · IC prep · Whole Foods ~$302 · in bed by 10:45 PM" },
  { day: "Tue", highlight: "LP roadshow calls · sauna + cold plunge · light dinner" },
  { day: "Wed", highlight: "Due diligence deep dive · meal prep Sunday carryover" },
  { day: "Thu", highlight: "Portfolio reviews · dinner date · meditation 10:30 PM" },
  { day: "Fri", highlight: "Market close debrief · recovery walk · sleep score 90+" },
  { day: "Sat", highlight: "Long run + Equinox · brunch · low screen time" },
  { day: "Sun", highlight: "Meal prep · fund letter draft · early night" },
];

export const jordanRossPreferences = {
  meal_style: ["High-protein", "Organic", "Meal prep Sundays", "Desk lunches"],
  caffeine: "Single espresso · 7:15 AM · no afternoon coffee",
  fitness_focus: ["Strength AM", "Cold plunge", "Zone 2 weekends"],
  gaming: "Minimal weekday screen time · Bloomberg + Calm only",
  groceries: "Whole Foods Yorkville · ~$300 per trip",
  hydration_goal_oz: 100,
};

const todayAt = (hour: number, minute: number) => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

/** Demo Today’s Schedule — explicit priority labels for Jordan Ross. */
export function buildJordanRossSchedule(): DemoEvent[] {
  return [
    { id: "jr-h1", title: "Team workout session", subtitle: "Health · Equinox Yorkville · squad lift", start_time: todayAt(6, 30), level: "High" },
    { id: "jr-m1", title: "MBA reading time", subtitle: "Education · case prep before market open", start_time: todayAt(7, 30), level: "Medium" },
    { id: "jr-h2", title: "Client meeting", subtitle: "Work · Wolf Capital · portfolio review", start_time: todayAt(8, 0), level: "High" },
    { id: "jr-h3", title: "Car insurance renewal", subtitle: "Finance · policy review & payment", start_time: todayAt(9, 30), level: "High" },
    { id: "jr-m2", title: "Weekly planning and journaling", subtitle: "Planning · goals + calendar lock", start_time: todayAt(10, 30), level: "Medium" },
    { id: "jr-h4", title: "Grocery shopping", subtitle: "Errands · Whole Foods Yorkville · ~$300", start_time: todayAt(12, 0), level: "High" },
    { id: "jr-h5", title: "Monthly rent payment", subtitle: "Finance · auto-pay confirmation", start_time: todayAt(12, 45), level: "High" },
    { id: "jr-l1", title: "Watch YouTube highlights", subtitle: "Entertainment · quick lunch break", start_time: todayAt(13, 15), level: "Low" },
    { id: "jr-m3", title: "Basketball training", subtitle: "Fitness · skills + conditioning", start_time: todayAt(15, 0), level: "Medium" },
    { id: "jr-m4", title: "Poker study session", subtitle: "Skills · GTO review · 45 min", start_time: todayAt(16, 30), level: "Medium" },
    { id: "jr-h6", title: "Dinner reservation with friends", subtitle: "Social · Alo · Yorkville · table for 4", start_time: todayAt(18, 30), level: "High" },
    { id: "jr-m5", title: "Guitar practice", subtitle: "Skills · acoustic · 30 min", start_time: todayAt(20, 0), level: "Medium" },
    { id: "jr-l2", title: "Gaming session", subtitle: "Entertainment · online · unwind", start_time: todayAt(21, 0), level: "Low" },
    { id: "jr-l3", title: "Casual Netflix night", subtitle: "Leisure · documentary or series", start_time: todayAt(22, 0), level: "Low" },
    { id: "jr-l4", title: "Evening walk", subtitle: "Leisure · Harbourfront · no phone", start_time: todayAt(22, 45), level: "Low" },
    { id: "jr-l5", title: "Listen to music before sleep", subtitle: "Leisure · jazz playlist · lights low", start_time: todayAt(23, 15), level: "Low" },
  ];
}

export const jordanRossBudget: BudgetSettings = {
  period: "Monthly",
  amount: 3200,
  alertAt: 85,
  cats: { Grocery: 1200, Amazon: 800, Other: 1200 },
};

function wholeFoodsOrder(
  id: string,
  daysAgo: number,
  status: PendingOrder["status"],
  lineItems: { name: string; qty: number; estimatedPrice: number }[],
): PendingOrder {
  const created = new Date();
  created.setDate(created.getDate() - daysAgo);
  const items = lineItems.map((i) => ({ ...i, estimatedPrice: i.estimatedPrice }));
  return {
    id,
    title: "Whole Foods grocery run",
    store: "Whole Foods",
    category: "Grocery",
    items,
    totalEstimatedPrice: computeOrderTotal(items),
    status,
    createdAt: created.toISOString(),
  };
}

const wfBasket = [
  { name: "Organic Atlantic salmon", qty: 2, estimatedPrice: 24.99 },
  { name: "Baby spinach & arugula mix", qty: 2, estimatedPrice: 6.49 },
  { name: "Cold-pressed green juice (6-pack)", qty: 1, estimatedPrice: 18.99 },
  { name: "Grass-fed ribeye", qty: 2, estimatedPrice: 32.5 },
  { name: "Greek yogurt & kefir", qty: 4, estimatedPrice: 7.25 },
  { name: "Almond butter & raw nuts", qty: 3, estimatedPrice: 14.99 },
  { name: "Electrolyte hydration", qty: 2, estimatedPrice: 22.0 },
  { name: "Meal-prep containers & herbs", qty: 1, estimatedPrice: 28.0 },
];

/** Typical ~$300 Whole Foods trips (Jordan's pattern). */
export function buildJordanRossOrders(): PendingOrder[] {
  const o1 = wholeFoodsOrder("jordan-wf-1", 6, "approved", wfBasket);
  const o2 = wholeFoodsOrder("jordan-wf-2", 3, "approved", [
    ...wfBasket.slice(0, 5),
    { name: "Magnesium & omega-3", qty: 2, estimatedPrice: 38.0 },
  ]);
  const o3 = wholeFoodsOrder("jordan-wf-3", 0, "approved", wfBasket);
  // Normalize totals near $300
  for (const o of [o1, o2, o3]) {
    const target = 298 + (o.id.charCodeAt(o.id.length - 1) % 15);
    const scale = target / Math.max(o.totalEstimatedPrice, 1);
    o.items = o.items.map((i) => ({
      ...i,
      estimatedPrice: Math.round(i.estimatedPrice * scale * 100) / 100,
    }));
    o.totalEstimatedPrice = computeOrderTotal(o.items);
  }
  return [o3, o2, o1];
}

/** Approvals are added only via chat/schedule actions — not seeded on profile load. */
export function buildJordanRossApprovals(_orders: PendingOrder[]): PendingItem[] {
  return [];
}

export function isJordanRossEmail(email: string | undefined | null): boolean {
  return email?.trim().toLowerCase() === JORDAN_ROSS_EMAIL;
}

function hoursAgoIso(hours: number) {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

export function buildJordanRossChatMessages() {
  return [
    {
      id: "jr-chat-1",
      role: "user" as const,
      content: "Can you protect my morning gym and line up Whole Foods before the IC block?",
      created_at: hoursAgoIso(6),
    },
    {
      id: "jr-chat-2",
      role: "assistant" as const,
      content:
        "Done — 6 AM strength is locked, and your ~$298 Whole Foods order is queued for approval. Readiness is 92 with sleep at 88; I left a 15-minute reset before your 2 PM portfolio sync.",
      created_at: hoursAgoIso(5.8),
    },
  ];
}

export const jordanRossPersona: PersonaBundle = {
  id: JORDAN_ROSS_ID,
  user: jordanRossUser,
  profile: jordanRossProfile,
  wellness: jordanRossWellness,
  insight: jordanRossInsight,
  recommendations: jordanRossRecommendations,
  notifications: jordanRossNotifications,
  preferences: jordanRossPreferences,
  budget: jordanRossBudget,
  scheduleToday: buildJordanRossSchedule,
  weekOverview: jordanRossWeekOverview,
  orders: buildJordanRossOrders,
  approvals: buildJordanRossApprovals,
  chatMessages: buildJordanRossChatMessages,
  seededFlagKey: SEEDED_FLAG,
};

