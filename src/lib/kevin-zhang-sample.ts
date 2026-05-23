import type { BudgetSettings } from "@/lib/budget-store";
import type { PendingItem } from "@/lib/approvals-store";
import type { DemoEvent } from "@/lib/demo-mode";
import type { PendingOrder } from "@/lib/pending-order";
import { computeOrderTotal } from "@/lib/pending-order";
import type { PersonaBundle, PersonaNotification, PersonaWellness } from "@/lib/persona-types";
import type { User } from "@supabase/supabase-js";

export const KEVIN_ZHANG_EMAIL = "kzhang@mail.utoronto.ca";
export const KEVIN_ZHANG_ID = "demo-kevin-zhang";

const todayAt = (hour: number, minute: number) => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

export const kevinZhangProfile = { display_name: "Kevin Zhang" };

export const kevinZhangUser = {
  id: KEVIN_ZHANG_ID,
  aud: "authenticated",
  role: "authenticated",
  email: KEVIN_ZHANG_EMAIL,
  app_metadata: {},
  user_metadata: { display_name: "Kevin Zhang" },
  created_at: "2026-05-18T00:00:00.000Z",
} as User;

export const kevinZhangWellness: PersonaWellness = {
  sleep_score: 58,
  readiness_score: 62,
  sleep_duration_min: 390,
  recovery_score: 54,
  hrv_ms: 42,
  stress_level: "moderate",
  resting_hr: 68,
  steps_today: 6840,
  screen_time_hours: 6.2,
  caffeine_mg: 180,
  hydration_oz: 28,
  notes: "Late sleep (2 AM), 11 AM wake. Exam week stress elevated.",
};

export const kevinZhangInsight =
  "Moderate readiness — sleep debt is catching up. Block a real wind-down before 1 AM, hit Goldring at 6:30 PM, and swap one takeout night for T&T meal prep. Assignment due Friday: protect 3:30–5 PM study block.";

export const kevinZhangRecommendations = [
  "Cap caffeine after 4 PM — you're at ~180 mg already (bubble tea + library coffee).",
  "Add 32 oz water before tonight's gaming block; hydration is under half your goal.",
  "Stack 25 min focused study before Valorant — STA257 problem set still open.",
  "T&T run pending approval: instant noodles + frozen dumplings + protein powder (~$58).",
];

export const kevinZhangNotifications: PersonaNotification[] = [
  {
    id: "kz-n1",
    title: "Recovery trending low",
    body: "HRV 42 ms · 8% below your 30-day avg. Consider a lighter gym day.",
    hoursAgo: 2,
    kind: "wellness",
  },
  {
    id: "kz-n2",
    title: "CSC258 assignment due Friday",
    body: "Moderate stress window — Simone blocked 3:30–5 PM study time on your calendar.",
    hoursAgo: 5,
    kind: "study",
  },
  {
    id: "kz-n3",
    title: "Food spend at 71% of monthly cap",
    body: "Grocery + bubble tea + takeout = $612 / $850. T&T trip awaiting approval.",
    hoursAgo: 8,
    kind: "budget",
  },
  {
    id: "kz-n4",
    title: "Screen time alert",
    body: "6.2 h today (mostly after 9 PM). Friends gaming session at 9:30 PM — set a 12:30 AM stop.",
    hoursAgo: 1,
    kind: "social",
  },
];

export const kevinZhangPreferences = {
  meal_style: ["Instant noodles", "T&T frozen dumplings", "Cheap takeout", "Protein shakes"],
  caffeine: "Chatime milk tea ~3:30 PM; second coffee during study block",
  fitness_focus: ["Evening gym — Goldring", "6k–8k steps", "Inconsistent recovery"],
  gaming: "Valorant with friends · 9:30 PM–1 AM typical",
  groceries: "T&T Supermarket (Kensington / Scarborough)",
  hydration_goal_oz: 64,
};

export const kevinZhangBudget: BudgetSettings = {
  period: "Monthly",
  amount: 850,
  alertAt: 80,
  cats: { Grocery: 320, Amazon: 120, Other: 410 },
};

/** Demo Today’s Schedule — explicit priority labels for Kevin Zhang. */
export function buildKevinZhangSchedule(): DemoEvent[] {
  return [
    { id: "kz-m1", title: "Coding practice", subtitle: "Skills · LeetCode + side repo", start_time: todayAt(10, 30), level: "Medium" },
    { id: "kz-h1", title: "University lecture", subtitle: "School · CSC258 · Bahen Centre", start_time: todayAt(11, 30), level: "High" },
    { id: "kz-h2", title: "Tuition payment reminder", subtitle: "Finance · UofT portal · due this week", start_time: todayAt(12, 15), level: "High" },
    { id: "kz-h3", title: "Group project meeting", subtitle: "School · team sync · Robarts study room", start_time: todayAt(14, 0), level: "High" },
    { id: "kz-m2", title: "Resume update", subtitle: "Career · internship applications", start_time: todayAt(15, 0), level: "Medium" },
    { id: "kz-h4", title: "Grocery shopping", subtitle: "Errands · T&T Kensington · meal prep", start_time: todayAt(16, 0), level: "High" },
    { id: "kz-h5", title: "Midterm study session", subtitle: "School · STA257 · problem sets", start_time: todayAt(16, 45), level: "High" },
    { id: "kz-m3", title: "Networking coffee chat", subtitle: "Career · alumni mentor · café near campus", start_time: todayAt(17, 30), level: "Medium" },
    { id: "kz-h6", title: "Gym workout", subtitle: "Health · Goldring Centre · push day", start_time: todayAt(18, 30), level: "High" },
    { id: "kz-m4", title: "Basketball with friends", subtitle: "Social · intramural court · pickup", start_time: todayAt(19, 45), level: "Medium" },
    { id: "kz-m5", title: "Side project work", subtitle: "Skills · hackathon app · 1 hr block", start_time: todayAt(21, 0), level: "Medium" },
    { id: "kz-l1", title: "Gaming with friends", subtitle: "Entertainment · Valorant squad", start_time: todayAt(22, 30), level: "Low" },
    { id: "kz-l2", title: "Discord hangout", subtitle: "Social · voice chat · unwind", start_time: todayAt(23, 5), level: "Low" },
    { id: "kz-l3", title: "Watch anime or YouTube", subtitle: "Entertainment · one episode cap", start_time: todayAt(23, 30), level: "Low" },
    { id: "kz-l4", title: "Late-night snack run", subtitle: "Leisure · convenience store · instant noodles", start_time: todayAt(23, 50), level: "Low" },
    { id: "kz-l5", title: "Browsing online shopping", subtitle: "Leisure · carts & wishlists · screen time", start_time: todayAt(23, 58), level: "Low" },
  ];
}

export const kevinZhangWeekOverview = [
  { day: "Mon", highlight: "CSC258 lab · evening gym · gaming until 1 AM" },
  { day: "Tue", highlight: "STA257 quiz prep · T&T grocery ~$52" },
  { day: "Wed", highlight: "Light class day · bubble tea ×2 · 7.4k steps" },
  { day: "Thu", highlight: "Assignment crunch · takeout · sleep 3 AM" },
  { day: "Fri", highlight: "CSC258 due · celebrate takeout · gym skipped" },
  { day: "Sat", highlight: "Kensington T&T · meal prep · gaming marathon" },
  { day: "Sun", highlight: "Recovery walk · study catch-up · sleep 2 AM" },
];

function ttOrder(
  id: string,
  daysAgo: number,
  status: PendingOrder["status"],
  items: { name: string; qty: number; estimatedPrice: number }[],
  title = "T&T Supermarket grocery run",
): PendingOrder {
  const created = new Date();
  created.setDate(created.getDate() - daysAgo);
  const lineItems = items.map((i) => ({ ...i }));
  return {
    id,
    title,
    store: "T&T Supermarket",
    category: "Grocery",
    items: lineItems,
    totalEstimatedPrice: computeOrderTotal(lineItems),
    status,
    createdAt: created.toISOString(),
  };
}

const ttBasket = [
  { name: "Instant noodles (multi-pack)", qty: 2, estimatedPrice: 8.99 },
  { name: "Frozen dumplings", qty: 2, estimatedPrice: 6.49 },
  { name: "Whey protein (sale size)", qty: 1, estimatedPrice: 24.99 },
  { name: "Rice 10 lb bag", qty: 1, estimatedPrice: 12.99 },
  { name: "Bok choy & green onion", qty: 1, estimatedPrice: 4.5 },
];

export function buildKevinZhangOrders(): PendingOrder[] {
  const o1 = ttOrder("kevin-tt-1", 4, "approved", ttBasket);
  const o2 = ttOrder("kevin-tt-2", 2, "approved", [
    { name: "Frozen scallion pancakes", qty: 2, estimatedPrice: 5.99 },
    { name: "Bubble tea kit (home)", qty: 1, estimatedPrice: 9.99 },
    { name: "Eggs & tofu", qty: 1, estimatedPrice: 8.5 },
    { name: "Instant ramen variety", qty: 3, estimatedPrice: 3.29 },
  ]);
  const o3 = ttOrder("kevin-tt-3", 0, "approved", [
    ...ttBasket,
    { name: "Matcha powder", qty: 1, estimatedPrice: 11.99 },
  ]);
  const takeout: PendingOrder = {
    id: "kevin-takeout-1",
    title: "Pizza Pizza — late night",
    store: "Pizza Pizza",
    category: "Other",
    items: [
      { name: "Medium pepperoni", qty: 1, estimatedPrice: 14.99 },
      { name: "Dipping sauce", qty: 2, estimatedPrice: 1.5 },
    ],
    totalEstimatedPrice: 17.99,
    status: "approved",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  };
  takeout.totalEstimatedPrice = computeOrderTotal(takeout.items);
  const bubble: PendingOrder = {
    id: "kevin-bbt-1",
    title: "Chatime — brown sugar milk tea",
    store: "Chatime",
    category: "Other",
    items: [{ name: "Large brown sugar milk tea", qty: 1, estimatedPrice: 7.8 }],
    totalEstimatedPrice: 7.8,
    status: "approved",
    createdAt: new Date().toISOString(),
  };
  return [o3, bubble, takeout, o2, o1];
}

/** Approvals are added only via chat/schedule actions — not seeded on profile load. */
export function buildKevinZhangApprovals(_orders: PendingOrder[]): PendingItem[] {
  return [];
}

function hoursAgoIso(hours: number) {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

export function buildKevinZhangChatMessages() {
  return [
    {
      id: "kz-chat-1",
      role: "user" as const,
      content: "Can you block study time before my gaming session tonight?",
      created_at: hoursAgoIso(4),
    },
    {
      id: "kz-chat-2",
      role: "assistant" as const,
      content:
        "Done — I kept 3:30–5 PM for CSC258/STA257 work and left 9:30 PM for Valorant. Your readiness is moderate; try cutting caffeine after 4 PM so 2 AM sleep doesn't hurt tomorrow's lecture.",
      created_at: hoursAgoIso(3.9),
    },
  ];
}

export const kevinZhangPersona: PersonaBundle = {
  id: KEVIN_ZHANG_ID,
  user: kevinZhangUser,
  profile: kevinZhangProfile,
  wellness: kevinZhangWellness,
  insight: kevinZhangInsight,
  recommendations: kevinZhangRecommendations,
  notifications: kevinZhangNotifications,
  preferences: kevinZhangPreferences,
  budget: kevinZhangBudget,
  scheduleToday: buildKevinZhangSchedule,
  weekOverview: kevinZhangWeekOverview,
  orders: buildKevinZhangOrders,
  approvals: buildKevinZhangApprovals,
  chatMessages: buildKevinZhangChatMessages,
  seededFlagKey: "simone-kevin-zhang-seeded",
};

export function isKevinZhangEmail(email: string | undefined | null): boolean {
  return email?.trim().toLowerCase() === KEVIN_ZHANG_EMAIL;
}
