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

/** Monthly cap used for progress bar: actualSpent / this value. */
export function getMonthlyBudgetForProgress(settings = readBudgetSettings()): number | "unlimited" {
  return getMonthlyBudgetCap(settings);
}

function calcPercentUsed(spent: number, monthlyBudget: number): number {
  if (monthlyBudget <= 0) return 0;
  return Math.round((spent / monthlyBudget) * 10000) / 100;
}

/** Recompute warning + notify UI after settings or spend change. */
export function refreshBudgetProgressFromSettings() {
  if (typeof window === "undefined") return;
  const monthlyBudget = getMonthlyBudgetForProgress();
  const spent = getApprovedSpendTotal();
  const t = readTracking();
  if (monthlyBudget === "unlimited") {
    writeTracking({ ...t, monthKey: currentMonthKey(), showExceededWarning: false });
  } else {
    writeTracking({
      ...t,
      monthKey: currentMonthKey(),
      showExceededWarning: spent > monthlyBudget,
    });
  }
  notifyBudgetChanged();
}

/** Persist budget settings and refresh Orders threshold (drops stale month-only bump). */
export function writeBudgetSettings(settings: BudgetSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(BUDGET_KEY, JSON.stringify(settings));
  const t = readTracking();
  writeTracking({
    ...t,
    monthKey: currentMonthKey(),
    monthOnlyCap: null,
  });
  refreshBudgetProgressFromSettings();
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
  const monthlyBudget = getMonthlyBudgetForProgress(settings);
  const showWarning = getBudgetExceededWarning();
  const monthOnlyCap = readTracking().monthOnlyCap;
  const alertAt = settings.alertAt ?? 90;
  const unlimited = monthlyBudget === "unlimited";
  const monthly = unlimited ? 0 : Math.max(0, monthlyBudget);
  const percentUsed = unlimited || monthly <= 0 ? 0 : calcPercentUsed(spent, monthly);
  const nearAlert = !unlimited && monthly > 0 && percentUsed >= alertAt && spent <= monthly;
  const remaining = unlimited ? null : Math.round((monthly - spent) * 100) / 100;
  const spentByCategory = getApprovedSpendByCategory();

  const key = `${spent}|${monthly}|${showWarning}|${monthOnlyCap ?? ""}|${settings.period}|${settings.amount}|${alertAt}|${spentByCategory.grocery}|${spentByCategory.other}`;
  if (key === cachedBudgetKey) return cachedBudgetView;
  cachedBudgetKey = key;
  cachedBudgetView = {
    spent,
    cap: unlimited ? "unlimited" : monthly,
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

/** Minimum monthly cap (CAD) after approval: cover spend + CA$50 buffer, rounded up. */
export function computeAutoAdjustedMonthlyCapCad(spent: number): number {
  const ceilSpent = Math.ceil(spent);
  return ceilSpent + 50;
}

/**
 * After approval, bump saved monthly budget so spend fits (e.g. CA$4307.52 → CA$4358).
 * Updates Set your budget amount and refreshes Orders budget UI.
 */
export function autoAdjustMonthlyBudgetToCoverSpend(): number | null {
  const spent = getApprovedSpendTotal();
  const cap = getMonthlyBudgetForProgress();
  if (cap === "unlimited") return null;

  if (spent <= cap) {
    const t = readTracking();
    if (t.showExceededWarning) {
      writeTracking({ ...t, showExceededWarning: false });
      notifyBudgetChanged();
    }
    return cap;
  }

  const nextCap = computeAutoAdjustedMonthlyCapCad(spent);
  setMonthlyBudgetCapCad(nextCap);
  return nextCap;
}

/** After user approves an order — sync spend vs cap and auto-raise monthly budget if needed. */
export function recordApprovedOrderSpend(_order: PendingOrder) {
  autoAdjustMonthlyBudgetToCoverSpend();
}

export function getBudgetExceededWarning(): boolean {
  const t = readTracking();
  const monthlyBudget = getMonthlyBudgetForProgress();
  if (monthlyBudget === "unlimited") return false;
  return t.showExceededWarning && getApprovedSpendTotal() > monthlyBudget;
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

/**
 * Persist monthly cap to shared budget state (`simone:budget`) and notify subscribers.
 * Used by Approvals so Orders Budget Threshold reads the new cap without a page refresh.
 */
export function saveSharedMonthlyBudgetCapCad(monthlyCapCad: number) {
  const rounded = Math.round(monthlyCapCad * 100) / 100;
  const settings = readBudgetSettings();
  if (typeof window !== "undefined") {
    localStorage.setItem(
      BUDGET_KEY,
      JSON.stringify({
        ...settings,
        period: "Monthly",
        amount: rounded,
        alertAt: settings.alertAt ?? 90,
      }),
    );
    const t = readTracking();
    localStorage.setItem(
      TRACKING_KEY,
      JSON.stringify({
        ...t,
        monthKey: currentMonthKey(),
        monthOnlyCap: null,
      }),
    );
  }
  notifyBudgetChanged();
}

/** User-entered monthly cap (CAD) — settings page and legacy callers. */
export function setMonthlyBudgetCapCad(monthlyCapCad: number) {
  saveSharedMonthlyBudgetCapCad(monthlyCapCad);
  const rounded = Math.round(monthlyCapCad * 100) / 100;
  const spent = getApprovedSpendTotal();
  writeTracking({
    monthKey: currentMonthKey(),
    monthOnlyCap: null,
    showExceededWarning: spent > rounded,
  });
  refreshBudgetProgressFromSettings();
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
