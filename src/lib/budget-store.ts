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
  weeklyBudget?: number | "unlimited";
  monthlyBudget?: number | "unlimited";
  quarterlyBudget?: number | "unlimited";
  weeklyAlertPercentage?: number;
  monthlyAlertPercentage?: number;
  quarterlyAlertPercentage?: number;
  cats?: Record<string, number>;
  /** User-set cap (Approvals / budget settings) — never revert to persona demo default */
  userCapOverride?: boolean;
};

const DEFAULT_ALERT_PERCENT = 90;
const PERIOD_PRESET_AMOUNT: Record<BudgetPeriod, number> = {
  Weekly: 200,
  Monthly: 800,
  Quarterly: 2400,
};

export type BudgetPeriodSnapshot = {
  spent: number;
  cap: number | "unlimited";
  remaining: number | null;
  percentUsed: number;
  alertAt: number;
  nearAlert: boolean;
};

export type NormalizedPeriodBudgets = {
  weeklyBudget: number | "unlimited";
  monthlyBudget: number | "unlimited";
  quarterlyBudget: number | "unlimited";
  weeklyAlertPercentage: number;
  monthlyAlertPercentage: number;
  quarterlyAlertPercentage: number;
};

function clampAlertPercent(n: number): number {
  return Math.min(100, Math.max(50, Math.round(n)));
}

/** Resolve per-period caps and alert % from stored settings (legacy single-period included). */
export function normalizePeriodBudgets(settings: BudgetSettings): NormalizedPeriodBudgets {
  const legacyAmount = settings.amount ?? PERIOD_PRESET_AMOUNT.Monthly;
  const legacyUnlimited = legacyAmount === "unlimited";
  const legacyNum = legacyUnlimited ? PERIOD_PRESET_AMOUNT.Monthly : (legacyAmount as number);
  const active = settings.period ?? "Monthly";
  const legacyAlert = clampAlertPercent(settings.alertAt ?? DEFAULT_ALERT_PERCENT);

  const weeklyBudget =
    settings.weeklyBudget ??
    (active === "Weekly" ? legacyAmount : legacyUnlimited ? "unlimited" : Math.round(legacyNum / 4));
  const monthlyBudget =
    settings.monthlyBudget ??
    (active === "Monthly" ? legacyAmount : legacyUnlimited ? "unlimited" : legacyNum);
  const quarterlyBudget =
    settings.quarterlyBudget ??
    (active === "Quarterly" ? legacyAmount : legacyUnlimited ? "unlimited" : Math.round(legacyNum * 3));

  return {
    weeklyBudget,
    monthlyBudget,
    quarterlyBudget,
    weeklyAlertPercentage: clampAlertPercent(
      settings.weeklyAlertPercentage ?? (active === "Weekly" ? legacyAlert : DEFAULT_ALERT_PERCENT),
    ),
    monthlyAlertPercentage: clampAlertPercent(
      settings.monthlyAlertPercentage ?? legacyAlert,
    ),
    quarterlyAlertPercentage: clampAlertPercent(
      settings.quarterlyAlertPercentage ?? (active === "Quarterly" ? legacyAlert : DEFAULT_ALERT_PERCENT),
    ),
  };
}

function getPeriodBounds(period: BudgetPeriod, ref = new Date()): { start: Date; end: Date } {
  if (period === "Weekly") {
    const start = new Date(ref);
    const day = start.getDay();
    start.setDate(start.getDate() - day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (period === "Quarterly") {
    const quarter = Math.floor(ref.getMonth() / 3);
    const start = new Date(ref.getFullYear(), quarter * 3, 1, 0, 0, 0, 0);
    const end = new Date(ref.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59, 999);
    return { start, end };
  }
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export function getApprovedSpendForPeriod(period: BudgetPeriod): number {
  const { start, end } = getPeriodBounds(period);
  const sum = approvedOrdersForSpend()
    .filter((o) => {
      const d = new Date(o.createdAt);
      return d >= start && d <= end;
    })
    .reduce((s, o) => s + (Number(o.totalEstimatedPrice) || 0), 0);
  return Math.round(sum * 100) / 100;
}

export function getApprovedSpendByCategoryForPeriod(
  period: BudgetPeriod,
): Record<OrderCategory, number> {
  const { start, end } = getPeriodBounds(period);
  const totals: Record<OrderCategory, number> = { grocery: 0, amazon: 0, other: 0 };
  for (const o of approvedOrdersForSpend()) {
    const d = new Date(o.createdAt);
    if (d < start || d > end) continue;
    const cat = o.category ?? inferOrderCategory(o.store, o.title);
    totals[cat] = Math.round((totals[cat] + (Number(o.totalEstimatedPrice) || 0)) * 100) / 100;
  }
  return totals;
}

function buildPeriodSnapshot(
  spent: number,
  cap: number | "unlimited",
  alertAt: number,
): BudgetPeriodSnapshot {
  const unlimited = cap === "unlimited";
  const budget = unlimited ? 0 : Math.max(0, cap);
  const percentUsed = unlimited || budget <= 0 ? 0 : calcPercentUsed(spent, budget);
  const remaining = unlimited ? null : Math.round((budget - spent) * 100) / 100;
  const nearAlert = !unlimited && budget > 0 && percentUsed >= alertAt && spent <= budget;
  return {
    spent,
    cap: unlimited ? "unlimited" : budget,
    remaining,
    percentUsed,
    alertAt,
    nearAlert,
  };
}

export function getPeriodBudgetCap(
  period: BudgetPeriod,
  settings = readBudgetSettings(),
): number | "unlimited" {
  const normalized = normalizePeriodBudgets(settings);
  if (period === "Weekly") return normalized.weeklyBudget;
  if (period === "Quarterly") return normalized.quarterlyBudget;
  return getEffectiveMonthlyCapFromSettings(settings, normalized);
}

function getEffectiveMonthlyCapFromSettings(
  settings: BudgetSettings,
  normalized = normalizePeriodBudgets(settings),
): number | "unlimited" {
  const base = normalized.monthlyBudget;
  if (base === "unlimited") return "unlimited";
  const t = readTracking();
  if (t.monthOnlyCap != null && t.monthOnlyCap > base) return t.monthOnlyCap;
  return base;
}

export function getPeriodAlertPercentage(
  period: BudgetPeriod,
  settings = readBudgetSettings(),
): number {
  const n = normalizePeriodBudgets(settings);
  if (period === "Weekly") return n.weeklyAlertPercentage;
  if (period === "Quarterly") return n.quarterlyAlertPercentage;
  return n.monthlyAlertPercentage;
}

type BudgetTracking = {
  monthKey: string;
  showExceededWarning: boolean;
  /** This-month-only raised cap after user accepts bump */
  monthOnlyCap: number | null;
  /** User raised monthly cap (Approvals / budget settings) — do not reset to persona default */
  userCapOverride?: boolean;
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

/** Monthly cap used for progress bar and approvals: actualSpent / this value. */
export function getMonthlyBudgetForProgress(settings = readBudgetSettings()): number | "unlimited" {
  return getEffectiveMonthlyCapFromSettings(settings);
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

/** Update alert threshold for a period — refreshes Orders threshold bar immediately. */
export function setBudgetAlertAtPercent(alertAt: number, period?: BudgetPeriod) {
  if (typeof window === "undefined") return;
  const clamped = clampAlertPercent(alertAt);
  const settings = readBudgetSettings();
  const target = period ?? settings.period ?? "Monthly";
  const patch: BudgetSettings = { ...settings, alertAt: clamped };
  if (target === "Weekly") patch.weeklyAlertPercentage = clamped;
  else if (target === "Quarterly") patch.quarterlyAlertPercentage = clamped;
  else patch.monthlyAlertPercentage = clamped;
  localStorage.setItem(BUDGET_KEY, JSON.stringify(patch));
  refreshBudgetProgressFromSettings();
}

/** Persist budget settings and refresh Orders threshold (drops stale month-only bump). */
export function writeBudgetSettings(settings: BudgetSettings, options?: { userOverride?: boolean }) {
  if (typeof window === "undefined") return;
  const period = settings.period ?? "Monthly";
  const amount = settings.amount;
  const alert = settings.alertAt != null ? clampAlertPercent(settings.alertAt) : undefined;
  const existing = readBudgetSettings();
  const merged: BudgetSettings = {
    ...existing,
    ...settings,
    ...(alert != null ? { alertAt: alert } : {}),
  };
  if (amount !== undefined) {
    if (period === "Weekly") merged.weeklyBudget = amount;
    else if (period === "Quarterly") merged.quarterlyBudget = amount;
    else merged.monthlyBudget = amount;
  }
  if (alert != null) {
    if (period === "Weekly") merged.weeklyAlertPercentage = alert;
    else if (period === "Quarterly") merged.quarterlyAlertPercentage = alert;
    else merged.monthlyAlertPercentage = alert;
  }
  const payload: BudgetSettings = options?.userOverride
    ? { ...merged, userCapOverride: true }
    : merged;
  localStorage.setItem(BUDGET_KEY, JSON.stringify(payload));
  const t = readTracking();
  writeTracking({
    ...t,
    monthKey: currentMonthKey(),
    monthOnlyCap: null,
    ...(options?.userOverride ? { userCapOverride: true } : {}),
  });
  refreshBudgetProgressFromSettings();
}

/** Normalize saved budget to a monthly spending cap (no month-only bump). */
export function getMonthlyBudgetCap(settings = readBudgetSettings()): number | "unlimited" {
  const { monthlyBudget } = normalizePeriodBudgets(settings);
  return monthlyBudget;
}

export function getEffectiveMonthlyCap(): number | "unlimited" {
  return getEffectiveMonthlyCapFromSettings(readBudgetSettings());
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
  weeklyBudget: number | "unlimited";
  monthlyBudget: number | "unlimited";
  quarterlyBudget: number | "unlimited";
  weeklyAlertPercentage: number;
  monthlyAlertPercentage: number;
  quarterlyAlertPercentage: number;
  weekly: BudgetPeriodSnapshot;
  monthly: BudgetPeriodSnapshot;
  quarterly: BudgetPeriodSnapshot;
  weeklySpentByCategory: Record<OrderCategory, number>;
  quarterlySpentByCategory: Record<OrderCategory, number>;
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
  weeklyBudget: 200,
  monthlyBudget: 800,
  quarterlyBudget: 2400,
  weeklyAlertPercentage: 90,
  monthlyAlertPercentage: 90,
  quarterlyAlertPercentage: 90,
  weekly: buildPeriodSnapshot(0, 200, 90),
  monthly: buildPeriodSnapshot(0, 800, 90),
  quarterly: buildPeriodSnapshot(0, 2400, 90),
  weeklySpentByCategory: { grocery: 0, amazon: 0, other: 0 },
  quarterlySpentByCategory: { grocery: 0, amazon: 0, other: 0 },
};

function getBudgetSnapshotView(): BudgetSnapshotView {
  const settings = readBudgetSettings();
  const normalized = normalizePeriodBudgets(settings);
  const monthlyCap = getEffectiveMonthlyCapFromSettings(settings, normalized);
  const monthlySpent = getApprovedSpendForPeriod("Monthly");
  const showWarning = getBudgetExceededWarning();
  const monthOnlyCap = readTracking().monthOnlyCap;
  const monthlyAlert = normalized.monthlyAlertPercentage;
  const unlimited = monthlyCap === "unlimited";
  const monthlyNum = unlimited ? 0 : Math.max(0, monthlyCap);
  const percentUsed =
    unlimited || monthlyNum <= 0 ? 0 : calcPercentUsed(monthlySpent, monthlyNum);
  const nearAlert =
    !unlimited && monthlyNum > 0 && percentUsed >= monthlyAlert && monthlySpent <= monthlyNum;
  const remaining = unlimited ? null : Math.round((monthlyNum - monthlySpent) * 100) / 100;
  const spentByCategory = getApprovedSpendByCategoryForPeriod("Monthly");
  const weeklySpentByCategory = getApprovedSpendByCategoryForPeriod("Weekly");
  const quarterlySpentByCategory = getApprovedSpendByCategoryForPeriod("Quarterly");

  const weeklySpent = getApprovedSpendForPeriod("Weekly");
  const quarterlySpent = getApprovedSpendForPeriod("Quarterly");
  const weekly = buildPeriodSnapshot(
    weeklySpent,
    normalized.weeklyBudget,
    normalized.weeklyAlertPercentage,
  );
  const monthly = buildPeriodSnapshot(monthlySpent, monthlyCap, monthlyAlert);
  const quarterly = buildPeriodSnapshot(
    quarterlySpent,
    normalized.quarterlyBudget,
    normalized.quarterlyAlertPercentage,
  );

  const key = [
    monthlySpent,
    monthlyNum,
    showWarning,
    monthOnlyCap ?? "",
    settings.period,
    settings.amount,
    monthlyAlert,
    normalized.weeklyBudget,
    normalized.quarterlyBudget,
    normalized.weeklyAlertPercentage,
    normalized.quarterlyAlertPercentage,
    weeklySpent,
    quarterlySpent,
    spentByCategory.grocery,
    spentByCategory.other,
    weeklySpentByCategory.grocery,
    quarterlySpentByCategory.grocery,
  ].join("|");
  if (key === cachedBudgetKey) return cachedBudgetView;
  cachedBudgetKey = key;
  cachedBudgetView = {
    spent: monthlySpent,
    cap: unlimited ? "unlimited" : monthlyNum,
    showWarning,
    monthOnlyCap,
    period: settings.period,
    periodAmount: normalized.monthlyBudget,
    alertAt: monthlyAlert,
    remaining,
    percentUsed,
    nearAlert,
    spentByCategory,
    weeklyBudget: normalized.weeklyBudget,
    monthlyBudget: normalized.monthlyBudget,
    quarterlyBudget: normalized.quarterlyBudget,
    weeklyAlertPercentage: normalized.weeklyAlertPercentage,
    monthlyAlertPercentage: normalized.monthlyAlertPercentage,
    quarterlyAlertPercentage: normalized.quarterlyAlertPercentage,
    weekly,
    monthly,
    quarterly,
    weeklySpentByCategory,
    quarterlySpentByCategory,
  };
  return cachedBudgetView;
}

/** After persona seed or order replace — align warning state with spend vs cap. */
export function syncBudgetWithApprovedSpend(settings?: BudgetSettings) {
  if (typeof window === "undefined") return;
  if (settings && !hasUserMonthlyCapOverride()) {
    writeBudgetSettings(settings);
  }
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

function budgetCheckFromProjected(
  spent: number,
  projected: number,
  monthlyCap: number | "unlimited",
): BudgetCheck {
  if (monthlyCap === "unlimited") {
    return { exceeds: false, overBy: 0, monthlyCap, spent, projected };
  }
  const exceeds = projected > monthlyCap;
  const overBy = exceeds ? Math.round((projected - monthlyCap) * 100) / 100 : 0;
  return { exceeds, overBy, monthlyCap, spent, projected };
}

export function evaluateOrderBudget(order: PendingOrder): BudgetCheck {
  const spent = getApprovedSpendTotal();
  const monthlyCap = getEffectiveMonthlyCap();
  const projected = Math.round((spent + order.totalEstimatedPrice) * 100) / 100;
  return budgetCheckFromProjected(spent, projected, monthlyCap);
}

/** Sum of multiple pending orders — used for Approve All. */
export function evaluateBatchOrdersBudget(orders: PendingOrder[]): BudgetCheck {
  const spent = getApprovedSpendTotal();
  const monthlyCap = getEffectiveMonthlyCap();
  const add = orders.reduce((s, o) => s + o.totalEstimatedPrice, 0);
  const projected = Math.round((spent + add) * 100) / 100;
  return budgetCheckFromProjected(spent, projected, monthlyCap);
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
        monthlyBudget: rounded,
        alertAt: settings.monthlyAlertPercentage ?? settings.alertAt ?? DEFAULT_ALERT_PERCENT,
        monthlyAlertPercentage:
          settings.monthlyAlertPercentage ?? settings.alertAt ?? DEFAULT_ALERT_PERCENT,
        userCapOverride: true,
      }),
    );
    const t = readTracking();
    localStorage.setItem(
      TRACKING_KEY,
      JSON.stringify({
        ...t,
        monthKey: currentMonthKey(),
        monthOnlyCap: null,
        userCapOverride: true,
      }),
    );
  }
  notifyBudgetChanged();
}

export function hasUserMonthlyCapOverride(): boolean {
  const settings = readBudgetSettings();
  return Boolean(settings.userCapOverride) || Boolean(readTracking().userCapOverride);
}

export function clearUserMonthlyCapOverride() {
  const settings = readBudgetSettings();
  if (typeof window !== "undefined") {
    const { userCapOverride: _removed, ...rest } = settings;
    localStorage.setItem(BUDGET_KEY, JSON.stringify(rest));
  }
  const t = readTracking();
  if (!t.userCapOverride) return;
  writeTracking({ ...t, userCapOverride: false });
}

/** User-entered monthly cap (CAD) — settings page and legacy callers. */
export function setMonthlyBudgetCapCad(monthlyCapCad: number) {
  saveSharedMonthlyBudgetCapCad(monthlyCapCad);
  const rounded = Math.round(monthlyCapCad * 100) / 100;
  const spent = getApprovedSpendTotal();
  const t = readTracking();
  writeTracking({
    ...t,
    monthKey: currentMonthKey(),
    monthOnlyCap: null,
    showExceededWarning: spent > rounded,
    userCapOverride: true,
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
