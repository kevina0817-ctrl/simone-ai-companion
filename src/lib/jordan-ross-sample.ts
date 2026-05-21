import type { User } from "@supabase/supabase-js";
import type { BudgetSettings } from "@/lib/budget-store";
import { writeBudgetSettings } from "@/lib/budget-store";
import type { PendingItem } from "@/lib/approvals-store";
import type { DemoEvent } from "@/lib/demo-mode";
import type { PendingOrder } from "@/lib/pending-order";
import { computeOrderTotal } from "@/lib/pending-order";

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

export const jordanRossWellness = {
  sleep_score: 88,
  readiness_score: 92,
  sleep_duration_min: 402,
};

export const jordanRossInsight =
  "You're in peak readiness for a dense deal day. Protect the 6 AM gym block, stack recovery before your dinner date, and keep Whole Foods runs predictable — your last three trips averaged about $300.";

const todayAt = (hour: number, minute: number) => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

/** Packed Bay Street day — gym, meetings, dinner, meditation. */
export function buildJordanRossSchedule(): DemoEvent[] {
  return [
    { id: "jr-1", title: "Gym — strength + conditioning", subtitle: "Equinox Yorkville · 6:00 AM", start_time: todayAt(6, 0), level: "High" },
    { id: "jr-2", title: "Market open prep", subtitle: "Bloomberg + overnight risk", start_time: todayAt(7, 15), level: "Medium" },
    { id: "jr-3", title: "Investment committee prep", subtitle: "Deck final pass", start_time: todayAt(8, 30), level: "High" },
    { id: "jr-4", title: "Team standup", subtitle: "Trading + research leads", start_time: todayAt(9, 0), level: "Medium" },
    { id: "jr-5", title: "LP quarterly update call", subtitle: "Zoom · 45 min", start_time: todayAt(10, 0), level: "High" },
    { id: "jr-6", title: "Due diligence deep dive", subtitle: "Series C fintech", start_time: todayAt(11, 30), level: "High" },
    { id: "jr-7", title: "Working lunch", subtitle: "Desk · protein + greens", start_time: todayAt(12, 30), level: "Medium" },
    { id: "jr-8", title: "Portfolio company sync", subtitle: "CEO check-in", start_time: todayAt(14, 0), level: "High" },
    { id: "jr-9", title: "Legal & compliance review", subtitle: "New fund terms", start_time: todayAt(15, 30), level: "High" },
    { id: "jr-10", title: "Client strategy block", subtitle: "Prep notes for dinner", start_time: todayAt(17, 0), level: "Medium" },
    { id: "jr-11", title: "Dinner date", subtitle: "Alo · Yorkville · 7:00 PM", start_time: todayAt(19, 0), level: "Medium" },
    { id: "jr-12", title: "Wind-down walk", subtitle: "Harbourfront · no phone", start_time: todayAt(21, 30), level: "Low" },
    { id: "jr-13", title: "Bedtime meditation", subtitle: "Calm · 20 min · lights out by 10:45", start_time: todayAt(22, 30), level: "Low" },
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
  const o3 = wholeFoodsOrder("jordan-wf-3", 0, "pending_approval", wfBasket);
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

export function buildJordanRossApprovals(orders: PendingOrder[]): PendingItem[] {
  const pendingWf = orders.find((o) => o.status === "pending_approval");
  const items: PendingItem[] = [
    {
      id: "jr-ap-cal-1",
      kind: "calendar",
      title: "Move IC prep earlier",
      detail: "Today 8:30 AM → 8:00 AM · High",
    },
  ];
  if (pendingWf) {
    items.unshift({
      id: pendingWf.id,
      kind: "order",
      title: `${pendingWf.title} — $${pendingWf.totalEstimatedPrice.toFixed(2)}`,
      detail: `Whole Foods · ${pendingWf.items.length} items · usual ~$300 trip`,
      orderId: pendingWf.id,
    });
  }
  return items;
}

export function isJordanRossEmail(email: string | undefined | null): boolean {
  return email?.trim().toLowerCase() === JORDAN_ROSS_EMAIL;
}

export function applyJordanRossSampleData(opts?: { force?: boolean }): void {
  if (typeof window === "undefined") return;
  if (!opts?.force && localStorage.getItem(SEEDED_FLAG)) return;

  const events = buildJordanRossSchedule();
  const orders = buildJordanRossOrders();

  localStorage.setItem("simone-demo-events", JSON.stringify(events));
  localStorage.setItem("simone-jordan-ross-seeded", new Date().toISOString());
  writeBudgetSettings(jordanRossBudget);

  void import("@/lib/pending-orders-store").then((m) => {
    m.replacePendingOrders(orders);
  });
  void import("@/lib/approvals-store").then((m) => {
    m.resetApprovalsPending(buildJordanRossApprovals(orders));
  });

  window.dispatchEvent(new Event("simone-demo-events-changed"));
}
