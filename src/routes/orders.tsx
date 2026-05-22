import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, ChevronRight, Inbox, Menu, SlidersHorizontal, Wallet } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { MobileFrame } from "@/components/MobileFrame";
import { RequireAuth } from "@/components/RequireAuth";
import { PendingOrderCard } from "@/components/PendingOrderCard";
import { inferOrderCategory } from "@/lib/order-category";
import type { OrderCategory } from "@/lib/pending-order";
import {
  applyMonthOnlyBudgetIncrease,
  BUDGET_CHANGED_EVENT,
  dismissBudgetExceededWarning,
  notifyBudgetChanged,
  useBudgetSnapshot,
  type BudgetPeriod,
  type BudgetPeriodSnapshot,
} from "@/lib/budget-store";
import { useApprovedOrders } from "@/lib/pending-orders-store";
import { useAuth } from "@/hooks/useAuth";
import { ensurePersonaBudgetForEmail } from "@/lib/persona-registry";

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "Orders — Simone" }] }),
  component: () => <RequireAuth><OrdersPage /></RequireAuth>,
});

const tabs = ["All", "Grocery", "Amazon", "Other"] as const;
type Tab = (typeof tabs)[number];

const BUDGET_PERIOD_TABS: BudgetPeriod[] = ["Weekly", "Monthly", "Quarterly"];

function periodSnapshotForTab(
  snapshot: ReturnType<typeof useBudgetSnapshot>,
  period: BudgetPeriod,
): BudgetPeriodSnapshot {
  if (period === "Weekly") return snapshot.weekly;
  if (period === "Quarterly") return snapshot.quarterly;
  return snapshot.monthly;
}

function budgetProgressBarColor(percentUsed: number, overMonthlyCap: boolean): string {
  if (overMonthlyCap) return "bg-risk-high";
  if (percentUsed <= 33) return "bg-success";
  if (percentUsed <= 66) return "bg-champagne";
  return "bg-risk-medium";
}

function BudgetExceededWarning() {
  const { showWarning, spent, cap } = useBudgetSnapshot();
  const unlimited = cap === "unlimited";
  const monthly = unlimited ? 0 : cap;

  if (!showWarning && !(spent > monthly && !unlimited)) return null;
  if (unlimited) return null;

  return (
    <div className="mt-4 rounded-2xl border border-risk-medium/40 bg-risk-medium/10 px-4 py-3 text-sm">
      <p className="leading-relaxed text-foreground">
        {spent > monthly
          ? `You're $${(spent - monthly).toFixed(2)} over your ${monthly.toFixed(0)} monthly cap. Raise it for this month only?`
          : "You're approaching your budget alert threshold. Raise your cap for this month only?"}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => dismissBudgetExceededWarning()}
          className="flex-1 rounded-full border border-border bg-secondary/50 py-2 text-xs font-medium"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={() => applyMonthOnlyBudgetIncrease()}
          className="flex-1 rounded-full bg-primary py-2 text-xs font-semibold text-primary-foreground"
        >
          Yes, raise this month
        </button>
      </div>
    </div>
  );
}

function BudgetCard() {
  const snapshot = useBudgetSnapshot();
  const [budgetPeriodTab, setBudgetPeriodTab] = useState<BudgetPeriod>("Monthly");
  const view = periodSnapshotForTab(snapshot, budgetPeriodTab);
  const { spent, cap, remaining, percentUsed, alertAt } = view;
  const unlimited = cap === "unlimited";
  const periodCap = unlimited ? 0 : Math.max(0, cap);
  const pct = unlimited || periodCap <= 0 ? 0 : percentUsed;
  const barWidthPct = unlimited || periodCap <= 0 ? 0 : Math.min(100, percentUsed);
  const periodLabelLower = budgetPeriodTab.toLowerCase();

  const spentByCategory =
    budgetPeriodTab === "Weekly"
      ? snapshot.weeklySpentByCategory
      : budgetPeriodTab === "Quarterly"
        ? snapshot.quarterlySpentByCategory
        : snapshot.spentByCategory;

  useEffect(() => {
    const refresh = () => notifyBudgetChanged();
    window.addEventListener(BUDGET_CHANGED_EVENT, refresh);
    window.addEventListener("simone-persona-wellness-changed", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    refresh();
    return () => {
      window.removeEventListener(BUDGET_CHANGED_EVENT, refresh);
      window.removeEventListener("simone-persona-wellness-changed", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const periodCapLabel =
    unlimited
      ? `${budgetPeriodTab} · unlimited`
      : `${budgetPeriodTab} · $${periodCap.toLocaleString()}`;

  return (
    <div className="mt-4 rounded-3xl bg-card/70 p-5 shadow-card">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15">
          <Wallet className="h-5 w-5 text-success" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium">Budget threshold</div>
          <div className="text-[11px] text-muted-foreground">
            {periodCapLabel}
            {!unlimited && ` · alert at ${alertAt}%`}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {unlimited
              ? `Unlimited ${periodLabelLower} budget — track spending freely.`
              : spent > periodCap
                ? `Over ${periodLabelLower} cap by $${(spent - periodCap).toFixed(2)}.`
                : pct >= alertAt
                  ? `At ${pct}% — at or past your ${alertAt}% alert.`
                  : remaining != null && remaining >= 0
                    ? `$${remaining.toFixed(2)} left this ${periodLabelLower}.`
                    : `You've spent ${pct}% of your ${periodLabelLower} budget.`}
          </div>
        </div>
        <div className="text-right text-xs font-medium">
          ${spent.toFixed(2)}
          <span className="text-muted-foreground"> / {unlimited ? "∞" : `$${periodCap}`}</span>
        </div>
      </div>

      <div className="mt-3 flex gap-1 rounded-full bg-card/60 p-1">
        {BUDGET_PERIOD_TABS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setBudgetPeriodTab(p)}
            className={`flex-1 rounded-full px-2 py-1.5 text-[10px] font-medium transition-colors ${
              budgetPeriodTab === p ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="relative mt-3 h-2">
        <div className="h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full rounded-full transition-all duration-300 ${budgetProgressBarColor(
              pct,
              !unlimited && spent > periodCap,
            )}`}
            style={{ width: unlimited ? "20%" : `${barWidthPct}%` }}
          />
        </div>
        {!unlimited && (
          <div
            className="pointer-events-none absolute top-0 z-10 h-full w-px -translate-x-1/2 bg-foreground/45 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
            style={{ left: `${alertAt}%` }}
            aria-hidden
            title={`Alert at ${alertAt}% of ${periodLabelLower} budget`}
          />
        )}
      </div>
      {!unlimited && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]">
          <CategorySpend label="Grocery" amount={spentByCategory.grocery} />
          <CategorySpend label="Amazon" amount={spentByCategory.amazon} />
          <CategorySpend label="Other" amount={spentByCategory.other} />
        </div>
      )}
      <BudgetExceededWarning />
      <Link
        to="/orders/budget"
        className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-secondary/40 px-3 py-2.5"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-card">
          <SlidersHorizontal className="h-4 w-4" />
        </div>
        <div className="flex-1 text-left">
          <div className="text-xs font-medium">Set your budget</div>
          <div className="text-[10px] text-muted-foreground">Choose period, cap, and category limits</div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>
    </div>
  );
}

function CategorySpend({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="rounded-lg bg-secondary/40 px-2 py-1.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium text-foreground">${amount.toFixed(2)}</div>
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mt-6 flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
        <Inbox className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="mt-3 text-sm font-medium">{title}</div>
      <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function OrdersList({ category }: { category?: OrderCategory }) {
  const approvedOrders = useApprovedOrders().filter((o) => {
    const cat = o.category ?? inferOrderCategory(o.store, o.title);
    return !category || cat === category;
  });

  return (
    <>
      {approvedOrders.map((order) => (
        <PendingOrderCard key={order.id} order={order} showApprovedActions />
      ))}
      {approvedOrders.length === 0 && (
        <EmptyState
          title={category ? `No ${category} orders` : "No orders yet"}
          hint="Approve a grocery or shopping order from Simone to see it here."
        />
      )}
    </>
  );
}

function TabContent({ tab }: { tab: Tab }) {
  const lists: Record<Tab, ReactNode> = {
    All: <OrdersList />,
    Grocery: <OrdersList category="grocery" />,
    Amazon: <OrdersList category="amazon" />,
    Other: <OrdersList category="other" />,
  };

  return (
    <>
      {lists[tab]}
      <BudgetCard />
    </>
  );
}

function OrdersPage() {
  const [tab, setTab] = useState<Tab>("All");
  const { user } = useAuth();

  useEffect(() => {
    ensurePersonaBudgetForEmail(user?.email);
    notifyBudgetChanged();
  }, [user?.id, user?.email]);

  return (
    <MobileFrame>
      <div className="px-5">
        <header className="flex items-center justify-between pb-3">
          <button type="button" className="rounded-full bg-card/70 p-2">
            <Menu className="h-4 w-4" />
          </button>
          <h1 className="font-display text-xl">Orders</h1>
          <button type="button" className="rounded-full bg-card/70 p-2">
            <Bell className="h-4 w-4" />
          </button>
        </header>

        <div className="flex gap-1 rounded-full bg-card/60 p-1">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <TabContent tab={tab} />
      </div>
    </MobileFrame>
  );
}
