import type { BudgetSettings } from "@/lib/budget-store";
import type { PendingItem } from "@/lib/approvals-store";
import type { DemoEvent } from "@/lib/demo-mode";
import type { PendingOrder } from "@/lib/pending-order";
import { computeOrderTotal } from "@/lib/pending-order";
import type { PersonaBundle, PersonaNotification, PersonaWellness } from "@/lib/persona-types";
import type { User } from "@supabase/supabase-js";

export const NICOLE_HART_EMAIL = "nicole@auraelevate.co";
export const NICOLE_HART_ID = "demo-nicole-hart";

const todayAt = (hour: number, minute: number) => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

export const nicoleHartProfile = { display_name: "Nicole Hart" };

export const nicoleHartUser = {
  id: NICOLE_HART_ID,
  aud: "authenticated",
  role: "authenticated",
  email: NICOLE_HART_EMAIL,
  app_metadata: {},
  user_metadata: { display_name: "Nicole Hart" },
  created_at: "2026-05-18T00:00:00.000Z",
} as User;

export const nicoleHartWellness: PersonaWellness = {
  sleep_score: 94,
  readiness_score: 96,
  sleep_duration_min: 462,
  recovery_score: 93,
  hrv_ms: 78,
  stress_level: "low",
  resting_hr: 54,
  steps_today: 10240,
  screen_time_hours: 2.1,
  caffeine_mg: 45,
  hydration_oz: 72,
  notes: "In bed by 10:15 PM · deep sleep 7h 42m · HRV trending up. Pilates + yoga day.",
};

export const nicoleHartInsight =
  "You're glowing today — readiness and recovery are both elite. Keep the 7 AM Pilates anchor, hydrate before afternoon tea, and let Simone prep your Whole Foods restock so dinner stays light before yoga.";

export const nicoleHartRecommendations = [
  "Matcha at 9 AM is perfect — skip a second caffeine hit; you're already at peak HRV.",
  "Walk 12 min after afternoon tea to keep steps above 10k without overtraining.",
  "Approve today's Whole Foods order (~$198) — berries and salmon align with your macro targets.",
  "Evening yoga at 6 PM: arrive 10 min early for breathwork — sleep score loves the cooldown.",
];

export const nicoleHartNotifications: PersonaNotification[] = [
  {
    id: "nh-n1",
    title: "Recovery in top 5% this month",
    body: "HRV 78 ms · sleep 94 · readiness 96. Your body loves the early bedtime routine.",
    hoursAgo: 1,
    kind: "wellness",
  },
  {
    id: "nh-n2",
    title: "Whole Foods order ready for approval",
    body: "Organic haul ~$198 · berries, salmon, supplements · fits your clean grocery streak.",
    hoursAgo: 3,
    kind: "budget",
  },
  {
    id: "nh-n3",
    title: "Afternoon tea at 2 PM",
    body: "Yorkville meetup with Mira & Jess — calendar protected; light lunch suggested before.",
    hoursAgo: 5,
    kind: "social",
  },
  {
    id: "nh-n4",
    title: "Hydration on track",
    body: "72 oz so far — add 8 oz before Pilates tomorrow for a perfect weekly average.",
    hoursAgo: 2,
    kind: "wellness",
  },
];

export const nicoleHartPreferences = {
  meal_style: ["Organic", "Wellness cafe", "Matcha rituals", "Light evening meals"],
  caffeine: "Ceremonial matcha ~9 AM only · no afternoon coffee",
  fitness_focus: ["Morning Pilates", "Evening yoga", "10k steps", "Premium recovery"],
  gaming: "Minimal screen time · curated wellness content only",
  groceries: "Whole Foods · ~$200 organic hauls",
  hydration_goal_oz: 80,
};

export const nicoleHartBudget: BudgetSettings = {
  period: "Monthly",
  amount: 2200,
  alertAt: 82,
  cats: { Grocery: 900, Amazon: 400, Other: 900 },
};

/** Curated wellness day — early rise, social cafe moments, evening yoga. */
export function buildNicoleHartSchedule(): DemoEvent[] {
  return [
    { id: "nh-1", title: "Morning ritual", subtitle: "7:00 AM · hydration + sunlight", start_time: todayAt(7, 0), level: "Low" },
    { id: "nh-2", title: "Pilates — reformer flow", subtitle: "Aura studio · 7:30 AM", start_time: todayAt(7, 30), level: "High" },
    { id: "nh-3", title: "Matcha + journaling", subtitle: "Home · ceremonial grade", start_time: todayAt(9, 0), level: "Low" },
    { id: "nh-4", title: "Wellness cafe lunch", subtitle: "Planta · grain bowl + greens", start_time: todayAt(11, 30), level: "Medium" },
    { id: "nh-5", title: "Afternoon tea with girlfriends", subtitle: "Yorkville · 2:00 PM", start_time: todayAt(14, 0), level: "Medium" },
    { id: "nh-6", title: "Neighborhood walk + supplements", subtitle: "Vitamin D · omega · magnesium", start_time: todayAt(16, 0), level: "Low" },
    { id: "nh-7", title: "Evening yoga — candlelit flow", subtitle: "6:00 PM · recovery focus", start_time: todayAt(18, 0), level: "Medium" },
    { id: "nh-8", title: "Light dinner prep", subtitle: "Salmon + roasted vegetables", start_time: todayAt(20, 0), level: "Low" },
    { id: "nh-9", title: "Skincare wind-down", subtitle: "No screens · 9:30 PM", start_time: todayAt(21, 30), level: "Low" },
    { id: "nh-10", title: "Sleep prep", subtitle: "Lights out · 10:15 PM target", start_time: todayAt(22, 15), level: "Low" },
  ];
}

export const nicoleHartWeekOverview = [
  { day: "Mon", highlight: "Pilates + Whole Foods prep · in bed by 10 PM" },
  { day: "Tue", highlight: "Yoga flow · cafe content shoot · sleep score 93" },
  { day: "Wed", highlight: "Girlfriend brunch · afternoon walk 11k steps" },
  { day: "Thu", highlight: "Recovery day · matcha only · meditation 20 min" },
  { day: "Fri", highlight: "Pilates + tea party · premium grocery ~$205" },
  { day: "Sat", highlight: "Farmers market · yoga retreat pop-up" },
  { day: "Sun", highlight: "Sleep-in 7:30 AM · meal prep · early night" },
];

function wholeFoodsOrder(
  id: string,
  daysAgo: number,
  status: PendingOrder["status"],
  items: { name: string; qty: number; estimatedPrice: number }[],
): PendingOrder {
  const created = new Date();
  created.setDate(created.getDate() - daysAgo);
  const lineItems = items.map((i) => ({ ...i }));
  return {
    id,
    title: "Whole Foods — organic wellness haul",
    store: "Whole Foods",
    category: "Grocery",
    items: lineItems,
    totalEstimatedPrice: computeOrderTotal(lineItems),
    status,
    createdAt: created.toISOString(),
  };
}

const premiumBasket = [
  { name: "Organic mixed berries", qty: 2, estimatedPrice: 8.99 },
  { name: "Hass avocado (bag)", qty: 1, estimatedPrice: 7.49 },
  { name: "Grass-fed Greek yogurt", qty: 2, estimatedPrice: 6.99 },
  { name: "Wild Atlantic salmon fillet", qty: 2, estimatedPrice: 16.99 },
  { name: "GT's kombucha (4-pack)", qty: 1, estimatedPrice: 14.99 },
  { name: "Califia almond milk", qty: 2, estimatedPrice: 5.49 },
  { name: "Magnesium + collagen supplements", qty: 1, estimatedPrice: 34.99 },
  { name: "RXBar protein snacks (12)", qty: 1, estimatedPrice: 24.99 },
  { name: "Organic baby kale & cucumber", qty: 2, estimatedPrice: 5.99 },
];

export function buildNicoleHartOrders(): PendingOrder[] {
  const o1 = wholeFoodsOrder("nicole-wf-1", 5, "approved", premiumBasket);
  const o2 = wholeFoodsOrder("nicole-wf-2", 0, "pending_approval", [
    ...premiumBasket,
    { name: "Organic lemon & ginger", qty: 1, estimatedPrice: 4.99 },
  ]);
  for (const o of [o1, o2]) {
    const target = 196 + (o.id.charCodeAt(o.id.length - 1) % 8);
    const scale = target / Math.max(o.totalEstimatedPrice, 1);
    o.items = o.items.map((i) => ({
      ...i,
      estimatedPrice: Math.round(i.estimatedPrice * scale * 100) / 100,
    }));
    o.totalEstimatedPrice = computeOrderTotal(o.items);
  }
  const matchaCafe: PendingOrder = {
    id: "nicole-matcha-1",
    title: "Planta — wellness lunch",
    store: "Planta",
    category: "Other",
    items: [
      { name: "Rainbow macro bowl", qty: 1, estimatedPrice: 22.0 },
      { name: "Ceremonial matcha", qty: 1, estimatedPrice: 8.5 },
    ],
    totalEstimatedPrice: 30.5,
    status: "approved",
    createdAt: new Date().toISOString(),
  };
  return [o2, matchaCafe, o1];
}

export function buildNicoleHartApprovals(orders: PendingOrder[]): PendingItem[] {
  const pendingWf = orders.find((o) => o.status === "pending_approval");
  return [
    ...(pendingWf
      ? [
          {
            id: pendingWf.id,
            kind: "order" as const,
            title: `Whole Foods — $${pendingWf.totalEstimatedPrice.toFixed(2)}`,
            detail: "Organic berries, salmon, supplements · curated ~$200 haul",
            orderId: pendingWf.id,
          },
        ]
      : []),
    {
      id: "nh-ap-yoga",
      kind: "calendar",
      title: "Evening yoga — recovery block",
      detail: "Today 6:00 PM · candlelit flow · protect from late meetings",
    },
  ];
}

function hoursAgoIso(hours: number) {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

export function buildNicoleHartChatMessages() {
  return [
    {
      id: "nh-chat-1",
      role: "user" as const,
      content: "Can you plan a glowy wellness day? Pilates morning, tea with the girls, yoga tonight.",
      created_at: hoursAgoIso(5),
    },
    {
      id: "nh-chat-2",
      role: "assistant" as const,
      content:
        "Your day is set — 7:30 AM Pilates, 2 PM Yorkville tea, 6 PM yoga, and sleep prep at 10:15 PM. Readiness is 96 with sleep at 94; I queued a ~$198 Whole Foods order with berries, salmon, and supplements for your approval.",
      created_at: hoursAgoIso(4.8),
    },
    {
      id: "nh-chat-3",
      role: "user" as const,
      content: "Love it. Keep lunch light before tea — something aesthetic at Planta?",
      created_at: hoursAgoIso(4.5),
    },
    {
      id: "nh-chat-4",
      role: "assistant" as const,
      content:
        "Added an 11:30 AM Planta wellness bowl + matcha. Hydration is strong at 72 oz — one more glass before tea and you'll hit your 80 oz goal.",
      created_at: hoursAgoIso(4.4),
    },
  ];
}

export const nicoleHartPersona: PersonaBundle = {
  id: NICOLE_HART_ID,
  user: nicoleHartUser,
  profile: nicoleHartProfile,
  wellness: nicoleHartWellness,
  insight: nicoleHartInsight,
  recommendations: nicoleHartRecommendations,
  notifications: nicoleHartNotifications,
  preferences: nicoleHartPreferences,
  budget: nicoleHartBudget,
  scheduleToday: buildNicoleHartSchedule,
  weekOverview: nicoleHartWeekOverview,
  orders: buildNicoleHartOrders,
  approvals: buildNicoleHartApprovals,
  chatMessages: buildNicoleHartChatMessages,
  seededFlagKey: "simone-nicole-hart-seeded",
};

export function isNicoleHartEmail(email: string | undefined | null): boolean {
  return email?.trim().toLowerCase() === NICOLE_HART_EMAIL;
}
