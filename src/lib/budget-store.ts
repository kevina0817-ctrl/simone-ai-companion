import { useSyncExternalStore } from "react";
import { inferOrderCategory, type OrderCategory } from "@/lib/order-category";
import { getOrdersSnapshot } from "@/lib/pending-orders-store";
import type { PendingOrder } from "@/lib/pending-order";

const BUDGET_KEY = "simone:budget";
const TRACKING_KEY = "simone:budget-tracking";
const ORDERS_KEY = "simone-pending-orders";

export type BudgetPeriod = "Weekly" | "Monthly" | "Quarterly";

export type BudgetSettings = {
  period: BudgetPeriod;
  amount: number | "unlimited";
  alertAt?: number;
  cats?: Record<string, number>;
};

type BudgetTracking = {
  monthKey: string;
  showExceededWarning: boolean;
  /** This-month-only raised cap after user accepts bump */
  monthOnlyCap: number | null;
};

const budgetListeners = new Set<() => void>();

function emitBudget() {
  budgetListeners.forEach((l) => l());
}

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function readTracking(): BudgetTracking {
  if (typeof window === "undefined") {
    return { monthKey: currentMonthKey(), showExceededWarning: false, monthOnlyCap: null };
  }
  try {
    const raw = localStorage.getItem(TRACKING_KEY);
    if (!raw) {
      return { monthKey: currentMonthKey(), showExceededWarning: false, monthOnlyCap: null };
    }
    const t = JSON.parse(raw) as BudgetTracking;
    if (t.monthKey !== currentMonthKey()) {
      return { monthKey: currentMonthKey(), showExceededWarning: false, monthOnlyCap: null };
    }
    return t;
  } catch {
    return { monthKey: currentMonthKey(), showExceededWarning: false, monthOnlyCap: null };
  }
}

function writeTracking(t: BudgetTracking) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TRACKING_KEY, JSON.stringify(t));
  emitBudget();
}

export function readBudgetSettings(): BudgetSettings {
  if (typeof window === "undefined") {
    return { period: "Monthly", amount: 800 };
  }
  try {
    const raw = localStorage.getItem(BUDGET_KEY);
    if (!raw) return { period: "Monthly", amount: 800 };
    return JSON.parse(raw) as BudgetSettings;
  } catch {
    return { period: "Monthly", amount: 800 };
  }
}

/** Persist budget settings and refresh Orders threshold (drops stale month-only bump). */
export function writeBudgetSettings(settings: BudgetSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(BUDGET_KEY, JSON.stringify(settings));
  const t = readTracking();
  if (t.monthOnlyCap != null) {
    writeTracking({ ...t, monthKey: currentMonthKey(), monthOnlyCap: null });
  }
  cachedBudgetKey = "";
  emitBudget();
}

/** Normalize saved budget to a monthly spending cap. */
export function getMonthlyBudgetCap(settings = readBudgetSettings()): number | "unlimited" {
  if (settings.amount === "unlimited") return "unlimited";
  const factor = settings.period === "Weekly" ? 4 : settings.period === "Quarterly" ? 1 / 3 : 1;
  return Math.round(settings.amount * factor);
}

export function getEffectiveMonthlyCap(): number | "unlimited" {
  const base = getMonthlyBudgetCap();
  if (base === "unlimited") return "unlimited";
  const t = readTracking();
  if (t.monthOnlyCap != null && t.monthOnlyCap > base) return t.monthOnlyCap;
  return base;
}

function loadOrdersFromStorage(): PendingOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingOrder[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((o) =>
      o.category ? o : { ...o, category: inferOrderCategory(o.store, o.title) },
    );
  } catch {
    return [];
  }
}

function approvedOrdersForSpend(): PendingOrder[] {
  if (typeof window !== "undefined") {
    const mem = getOrdersSnapshot();
    if (mem.length > 0) {
      return mem.filter((o) => o.status === "approved");
    }
  }
  return loadOrdersFromStorage().filter((o) => o.status === "approved");
}

export function getApprovedSpendTotal(): number {
  const sum = approvedOrdersForSpend().reduce((s, o) => s + (Number(o.totalEstimatedPrice) || 0), 0);
  return Math.round(sum * 100) / 100;
}

export function getApprovedSpendByCategory(): Record<OrderCategory, number> {
  const totals: Record<OrderCategory, number> = { grocery: 0, amazon: 0, other: 0 };
  for (const o of approvedOrdersForSpend()) {
    const cat = o.category ?? inferOrderCategory(o.store, o.title);
    totals[cat] = Math.round((totals[cat] + (Number(o.totalEstimatedPrice) || 0)) * 100) / 100;
  }
  return totals;
}

export type BudgetSnapshotView = {
  spent: number;
  cap: number | "unlimited";
  showWarning: boolean;
  monthOnlyCap: number | null;
  period: BudgetPeriod;
  periodAmount: number | "unlimited";
  alertAt: number;
  remaining: number | null;
  percentUsed: number;
  nearAlert: boolean;
  spentByCategory: Record<OrderCategory, number>;
};

let cachedBudgetKey = "";
let cachedBudgetView: BudgetSnapshotView = {
  spent: 0,
  cap: 800,
  showWarning: false,
  monthOnlyCap: null,
  period: "Monthly",
  periodAmount: 800,
  alertAt: 90,
  remaining: 800,
  percentUsed: 0,
  nearAlert: false,
  spentByCategory: { grocery: 0, amazon: 0, other: 0 },
};

function getBudgetSnapshotView(): BudgetSnapshotView {
  const settings = readBudgetSettings();
  const spent = getApprovedSpendTotal();
  const cap = getEffectiveMonthlyCap();
  const showWarning = getBudgetExceededWarning();
  const monthOnlyCap = readTracking().monthOnlyCap;
  const alertAt = settings.alertAt ?? 90;
  const unlimited = cap === "unlimited";
  const monthly = unlimited ? 0 : Math.max(0, cap);
  const percentUsed =
    unlimited || monthly <= 0 ? 0 : Math.min(100, Math.round((spent / monthly) * 100));
  const nearAlert = !unlimited && monthly > 0 && percentUsed >= alertAt && spent <= monthly;
  const remaining = unlimited ? null : Math.round((monthly - spent) * 100) / 100;
  const spentByCategory = getApprovedSpendByCategory();

  const key = `${spent}|${cap}|${showWarning}|${monthOnlyCap ?? ""}|${settings.period}|${settings.amount}|${alertAt}|${spentByCategory.grocery}|${spentByCategory.other}`;
  if (key === cachedBudgetKey) return cachedBudgetView;
  cachedBudgetKey = key;
  cachedBudgetView = {
    spent,
    cap,
    showWarning,
    monthOnlyCap,
    period: settings.period,
    periodAmount: settings.amount,
    alertAt,
    remaining,
    percentUsed,
    nearAlert,
    spentByCategory,
  };
  return cachedBudgetView;
}

/** After persona seed or order replace — align warning state with spend vs cap. */
export function syncBudgetWithApprovedSpend(settings?: BudgetSettings) {
  if (typeof window === "undefined") return;
  if (settings) writeBudgetSettings(settings);
  const cap = getEffectiveMonthlyCap();
  const spent = getApprovedSpendTotal();
  const alertAt = (settings ?? readBudgetSettings()).alertAt ?? 90;
  if (cap !== "unlimited" && cap > 0) {
    const pct = (spent / cap) * 100;
    const t = readTracking();
    if (spent > cap || pct >= alertAt) {
      writeTracking({ ...t, monthKey: currentMonthKey(), showExceededWarning: spent > cap });
    }
  }
  notifyBudgetChanged();
}

export const BUDGET_CHANGED_EVENT = "simone-budget-changed";

export function notifyBudgetChanged() {
  cachedBudgetKey = "";
  emitBudget();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BUDGET_CHANGED_EVENT));
  }
}

export type BudgetCheck = {
  exceeds: boolean;
  overBy: number;
  monthlyCap: number | "unlimited";
  spent: number;
  projected: number;
};

export function evaluateOrderBudget(order: PendingOrder): BudgetCheck {
  const spent = getApprovedSpendTotal();
  const monthlyCap = getEffectiveMonthlyCap();
  const projected = Math.round((spent + order.totalEstimatedPrice) * 100) / 100;

  if (monthlyCap === "unlimited") {
    return { exceeds: false, overBy: 0, monthlyCap, spent, projected };
  }

  const exceeds = projected > monthlyCap;
  const overBy = exceeds ? Math.round((projected - monthlyCap) * 100) / 100 : 0;
  return { exceeds, overBy, monthlyCap, spent, projected };
}

export function orderWithBudgetFlags(order: PendingOrder): PendingOrder {
  const check = evaluateOrderBudget(order);
  return {
    ...order,
    exceedsBudget: check.exceeds,
    budgetOverBy: check.exceeds ? check.overBy : undefined,
  };
}

/** After user approves an order — show budget warning on Orders if over cap. */
export function recordApprovedOrderSpend(_order: PendingOrder) {
  const cap = getEffectiveMonthlyCap();
  if (cap === "unlimited") return;
  const spentAfter = getApprovedSpendTotal();
  if (spentAfter > cap) {
    writeTracking({ ...readTracking(), showExceededWarning: true });
  }
}

export function getBudgetExceededWarning(): boolean {
  const t = readTracking();
  const cap = getEffectiveMonthlyCap();
  if (cap === "unlimited") return false;
  return t.showExceededWarning && getApprovedSpendTotal() > cap;
}

/** User chose to raise cap for this calendar month only. */
export function applyMonthOnlyBudgetIncrease() {
  const spent = getApprovedSpendTotal();
  raiseMonthlyBudgetForProjectedSpend(spent);
}

/** Raise this month's cap so projected spend (incl. pending approval) fits. */
export function raiseMonthlyBudgetForProjectedSpend(projected: number) {
  const base = getMonthlyBudgetCap();
  const baseNum = base === "unlimited" ? projected : base;
  const t = readTracking();
  writeTracking({
    monthKey: currentMonthKey(),
    monthOnlyCap: Math.max(Math.ceil(projected), baseNum) + 50,
    showExceededWarning: false,
  });
  notifyBudgetChanged();
}

/** User-entered monthly cap (CAD) from Approvals budget reset — applies to settings + this month. */
export function setMonthlyBudgetCapCad(monthlyCapCad: number) {
  const rounded = Math.round(monthlyCapCad * 100) / 100;
  const settings = readBudgetSettings();
  writeBudgetSettings({
    ...settings,
    period: "Monthly",
    amount: rounded,
    alertAt: settings.alertAt ?? 90,
  });
  writeTracking({
    monthKey: currentMonthKey(),
    monthOnlyCap: rounded,
    showExceededWarning: false,
  });
  notifyBudgetChanged();
}

export function validateMonthlyBudgetCad(
  amount: number,
  minimumCad: number,
): { ok: true } | { ok: false; message: string } {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Enter a valid monthly budget in CAD." };
  }
  if (amount < minimumCad) {
    return {
      ok: false,
      message: `Monthly budget must be at least CA$${minimumCad.toFixed(2)} to cover current spend plus this order.`,
    };
  }
  return { ok: true };
}

export function dismissBudgetExceededWarning() {
  const t = readTracking();
  writeTracking({ ...t, showExceededWarning: false });
}

export function useBudgetSnapshot(): BudgetSnapshotView {
  return useSyncExternalStore(subscribeBudget, getBudgetSnapshotView, () => cachedBudgetView);
}

function subscribeBudget(listener: () => void) {
  budgetListeners.add(listener);
  return () => budgetListeners.delete(listener);
}
