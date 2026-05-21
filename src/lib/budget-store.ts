import { useSyncExternalStore } from "react";
import { inferOrderCategory } from "@/lib/order-category";
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

export function getApprovedSpendTotal(): number {
  const approved = loadOrdersFromStorage().filter((o) => o.status === "approved");
  const sum = approved.reduce((s, o) => s + (Number(o.totalEstimatedPrice) || 0), 0);
  return Math.round(sum * 100) / 100;
}

export type BudgetSnapshotView = {
  spent: number;
  cap: number | "unlimited";
  showWarning: boolean;
  monthOnlyCap: number | null;
};

let cachedBudgetKey = "";
let cachedBudgetView: BudgetSnapshotView = {
  spent: 0,
  cap: 800,
  showWarning: false,
  monthOnlyCap: null,
};

function getBudgetSnapshotView(): BudgetSnapshotView {
  const spent = getApprovedSpendTotal();
  const cap = getEffectiveMonthlyCap();
  const showWarning = getBudgetExceededWarning();
  const monthOnlyCap = readTracking().monthOnlyCap;
  const key = `${spent}|${cap}|${showWarning}|${monthOnlyCap ?? ""}`;
  if (key === cachedBudgetKey) return cachedBudgetView;
  cachedBudgetKey = key;
  cachedBudgetView = { spent, cap, showWarning, monthOnlyCap };
  return cachedBudgetView;
}

export function notifyBudgetChanged() {
  emitBudget();
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
  const t = readTracking();
  writeTracking({
    monthKey: currentMonthKey(),
    monthOnlyCap: Math.max(Math.ceil(spent), getMonthlyBudgetCap() as number) + 50,
    showExceededWarning: false,
  });
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
