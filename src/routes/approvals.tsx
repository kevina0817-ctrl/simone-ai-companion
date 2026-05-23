import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Calendar, Check, Filter, Package, ShoppingBag, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { MobileFrame } from "@/components/MobileFrame";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/hooks/useAuth";
import {
  decide,
  isScheduleApproval,
  isShoppingApproval,
  resolveOrderIdForApproval,
  usePending,
  formatApprovalDecisionLabel,
  useRecentDecisions,
  useStatus,
  type ApprovalsDecideContext,
  type PendingItem,
} from "@/lib/approvals-store";
import type { OrderCategory } from "@/lib/order-category";
import { formatScheduleTimeRange } from "@/lib/schedule-item";
import { SchedulePriorityIndicator } from "@/components/SchedulePriorityIndicator";
import { getSchedulePriorityStyles } from "@/lib/schedule-priority";
import type { BudgetCheck } from "@/lib/budget-store";
import {
  approveAllPendingApprovals,
  declineAllPendingApprovals,
  approveShoppingOrderWithMonthlyBudgetCad,
  categoryLabel,
  declineShoppingApproval,
  ordersTabForCategory,
  suggestedMonthlyBudgetCad,
  tryApproveShoppingOrder,
} from "@/lib/order-approval";
import { backendAvailable, demoUser } from "@/lib/demo-mode";
import { getPendingApprovalOrder } from "@/lib/pending-orders-store";
import { PendingOrderCard } from "@/components/PendingOrderCard";

export const Route = createFileRoute("/approvals")({
  head: () => ({ meta: [{ title: "Approvals — Simone" }] }),
  component: () => <RequireAuth><ApprovalsPage /></RequireAuth>,
});

type Tab = "pending" | "completed";

type Activity = {
  id: string;
  icon: ReactNode;
  title: string;
  detail: string;
  when: string;
  status: "approved" | "declined" | "auto";
};

const statusChip: Record<Activity["status"], string> = {
  approved: "bg-success/15 text-success",
  declined: "bg-risk-high/15 text-risk-high",
  auto: "bg-champagne/15 text-champagne",
};
const statusLabel: Record<Activity["status"], string> = {
  approved: "Approved",
  declined: "Declined",
  auto: "Auto",
};

function ActivityRow({ a, showCompletionLabel }: { a: Activity; showCompletionLabel?: boolean }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-card/60 p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary">{a.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{a.title}</div>
        <div className="truncate text-[11px] text-muted-foreground">{a.detail}</div>
      </div>
      <div className="flex flex-col items-end gap-1">
        {showCompletionLabel ? (
          <span
            className={`text-[10px] font-medium ${
              a.status === "approved" ? "text-success" : a.status === "declined" ? "text-risk-high" : "text-muted-foreground"
            }`}
          >
            {a.when}
          </span>
        ) : (
          <>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusChip[a.status]}`}>
              {statusLabel[a.status]}
            </span>
            <span className="text-[10px] text-muted-foreground">{a.when}</span>
          </>
        )}
      </div>
    </li>
  );
}

function ApprovalsPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const pending = usePending();

  return (
    <MobileFrame>
      <div className="px-5">
        <header className="flex items-center justify-between pb-3">
          <button className="rounded-full bg-card/70 p-2"><ArrowLeft className="h-4 w-4" /></button>
          <h1 className="flex items-center gap-2 font-display text-xl">
            Approvals
            {pending.length > 0 && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {pending.length}
              </span>
            )}
          </h1>
          <button className="rounded-full bg-card/70 p-2"><Filter className="h-4 w-4" /></button>
        </header>

        <div className="flex gap-1 rounded-full bg-card/60 p-1">
          {[
            { id: "pending", label: "Pending" },
            { id: "completed", label: "Completed" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as Tab)}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "pending" ? <PendingTab /> : <CompletedTab />}
      </div>
    </MobileFrame>
  );
}

function StatusBanner({ status }: { status: "approved" | "declined" }) {
  const approved = status === "approved";
  return (
    <div className={`mt-4 flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold ${
      approved ? "bg-success/15 text-success" : "bg-risk-high/15 text-risk-high"
    }`}>
      {approved ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
      {approved ? "Approved" : "Declined"}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mt-5 mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

function useDecideContext(): ApprovalsDecideContext | null {
  const { user } = useAuth();
  const qc = useQueryClient();
  if (!user) return null;
  return { userId: backendAvailable ? user.id : demoUser.id, queryClient: qc };
}

function ActionButtons({ id }: { id: string }) {
  const ctx = useDecideContext();
  return (
    <div className="mt-4 flex gap-2">
      <button
        type="button"
        onClick={() => void decide(id, "declined", ctx ?? undefined)}
        className="flex-1 rounded-full border border-border bg-secondary/50 py-2.5 text-sm font-medium"
      >
        Decline
      </button>
      <button
        type="button"
        onClick={() => void decide(id, "approved", ctx ?? undefined)}
        disabled={!ctx}
        className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
      >
        Approve
      </button>
    </div>
  );
}

function ScheduleApprovalCard({ id, item }: { id: string; item: PendingItem }) {
  const status = useStatus(id) ?? "pending";
  const ev = item.scheduleEvent;
  if (!ev) return null;

  const when = formatScheduleTimeRange(ev, ev.time_zone);
  const priority = getSchedulePriorityStyles(ev.level, ev.title);

  return (
    <article className={`mt-4 rounded-3xl border-l-4 bg-card/70 p-5 shadow-card ${priority.accent}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${priority.chip}`}>
          <Calendar className={`h-5 w-5 ${priority.text}`} />
        </div>
        <div className="flex-1">
          <div className="text-base font-medium leading-tight">{ev.title}</div>
          <div className="text-[11px] text-muted-foreground">Schedule • Adds to today&apos;s timeline when approved</div>
        </div>
        <SchedulePriorityIndicator level={ev.level} title={ev.title} variant="dot-chip" />
      </div>
      <div className="mt-3 rounded-2xl border border-border/60 bg-background/40 p-3 text-sm">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">When</div>
        <div className="mt-0.5 font-medium">{when}</div>
        {ev.subtitle && (
          <>
            <div className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">Details</div>
            <div className="mt-0.5 text-muted-foreground">{ev.subtitle}</div>
          </>
        )}
      </div>
      {status === "pending" ? <ActionButtons id={id} /> : <StatusBanner status={status} />}
    </article>
  );
}

function OrderBudgetPrompt({
  check,
  orderTotal,
  priceSymbol,
  batchLabel,
  onStartRaise,
  onDecline,
  busy,
}: {
  check: BudgetCheck;
  orderTotal: number;
  priceSymbol: string;
  batchLabel?: boolean;
  onStartRaise: () => void;
  onDecline: () => void;
  busy: boolean;
}) {
  const cap = check.monthlyCap === "unlimited" ? 0 : check.monthlyCap;
  const overBy = check.overBy;

  return (
    <div className="mt-4 rounded-2xl border border-risk-medium/40 bg-risk-medium/10 px-4 py-3 text-sm">
      <p className="leading-relaxed text-foreground">
        {batchLabel
          ? overBy > 0
            ? `Approving all pending orders (${priceSymbol}${orderTotal.toFixed(2)} total) would put you $${overBy.toFixed(2)} over your $${cap.toFixed(0)} monthly budget. Raise your cap for this month only?`
            : `These orders would exceed your $${cap.toFixed(0)} monthly budget threshold. Raise your cap for this month only?`
          : overBy > 0
            ? `Approving this order (${priceSymbol}${orderTotal.toFixed(2)}) would put you $${overBy.toFixed(2)} over your $${cap.toFixed(0)} monthly budget. Raise your cap for this month only?`
            : `This order would exceed your $${cap.toFixed(0)} monthly budget threshold. Raise your cap for this month only?`}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onDecline}
          className="flex-1 rounded-full border border-border bg-secondary/50 py-2 text-xs font-medium disabled:opacity-50"
        >
          Not now
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onStartRaise}
          className="flex-1 rounded-full bg-primary py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          Yes, raise this month
        </button>
      </div>
    </div>
  );
}

function OrderBudgetRaiseForm({
  check,
  busy,
  inputError,
  onCancel,
  onSave,
}: {
  check: BudgetCheck;
  busy: boolean;
  inputError: string | null;
  onCancel: () => void;
  onSave: (amountCad: number) => void;
}) {
  const [value, setValue] = useState(() => String(suggestedMonthlyBudgetCad(check)));

  return (
    <div className="mt-4 rounded-2xl border border-primary/30 bg-card/90 px-4 py-4 text-sm shadow-card">
      <div className="text-sm font-medium">Set monthly budget (CAD)</div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        Enter a new monthly cap for this month. The order will be approved only after you save a budget
        of at least CA${check.projected.toFixed(2)} (current spend plus this order).
      </p>
      <label className="mt-3 block">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Monthly budget (CAD)</span>
        <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-border bg-background/60 px-3 py-2">
          <span className="text-sm text-muted-foreground">CA$</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
            className="w-full bg-transparent text-sm font-medium focus:outline-none disabled:opacity-50"
            aria-label="New monthly budget in CAD"
          />
        </div>
      </label>
      {inputError && <p className="mt-2 text-xs text-risk-high">{inputError}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="flex-1 rounded-full border border-border bg-secondary/50 py-2 text-xs font-medium disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave(Number.parseFloat(value))}
          className="flex-1 rounded-full bg-primary py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          Save budget & approve
        </button>
      </div>
    </div>
  );
}

function OrderActionButtons({ id }: { id: string }) {
  const ctx = useDecideContext();
  const [budgetCheck, setBudgetCheck] = useState<BudgetCheck | null>(null);
  const [showBudgetInput, setShowBudgetInput] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const orderId = resolveOrderIdForApproval(id) ?? id;
  const order = getPendingApprovalOrder(orderId);

  const finishApproved = (approved: { category: OrderCategory }) => {
    const tab = ordersTabForCategory(approved.category);
    toast.success(`Order approved — see it under Orders → ${tab}`);
  };

  const clearBudgetFlow = () => {
    setBudgetCheck(null);
    setShowBudgetInput(false);
    setInputError(null);
  };

  const onApprove = async () => {
    if (!ctx) return;
    setBusy(true);
    setInputError(null);
    try {
      const result = await tryApproveShoppingOrder(id, ctx);
      if (result.status === "needs_budget") {
        setBudgetCheck(result.check);
        setShowBudgetInput(false);
        return;
      }
      if (result.status === "approved") {
        clearBudgetFlow();
        finishApproved(result.order);
      }
    } finally {
      setBusy(false);
    }
  };

  const onSaveBudgetAndApprove = async (amountCad: number) => {
    if (!ctx) return;
    setBusy(true);
    setInputError(null);
    try {
      const result = await approveShoppingOrderWithMonthlyBudgetCad(id, amountCad, ctx);
      if (result.status === "invalid_budget") {
        setInputError(result.message);
        return;
      }
      if (result.status === "needs_budget") {
        setBudgetCheck(result.check);
        setShowBudgetInput(false);
        setInputError("That budget is still too low for this order. Try a higher amount.");
        return;
      }
      if (result.status === "approved") {
        clearBudgetFlow();
        finishApproved(result.order);
      }
    } finally {
      setBusy(false);
    }
  };

  const onDeclineBudget = async () => {
    if (!ctx) return;
    setBusy(true);
    try {
      await declineShoppingApproval(id, ctx);
      clearBudgetFlow();
      toast.message("Order declined — it stays off your Orders page");
    } finally {
      setBusy(false);
    }
  };

  const inBudgetFlow = Boolean(budgetCheck);

  return (
    <>
      {budgetCheck && order && !showBudgetInput && (
        <OrderBudgetPrompt
          check={budgetCheck}
          orderTotal={order.totalEstimatedPrice}
          priceSymbol={order.amountCurrency === "CAD" ? "CA$" : "$"}
          onStartRaise={() => {
            setShowBudgetInput(true);
            setInputError(null);
          }}
          onDecline={() => void onDeclineBudget()}
          busy={busy}
        />
      )}
      {budgetCheck && showBudgetInput && (
        <OrderBudgetRaiseForm
          check={budgetCheck}
          busy={busy}
          inputError={inputError}
          onCancel={() => {
            setShowBudgetInput(false);
            setInputError(null);
          }}
          onSave={(amount) => void onSaveBudgetAndApprove(amount)}
        />
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void declineShoppingApproval(id, ctx ?? undefined)}
          className="flex-1 rounded-full border border-border bg-secondary/50 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          Decline
        </button>
        <button
          type="button"
          disabled={!ctx || busy || inBudgetFlow}
          onClick={() => void onApprove()}
          className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
        >
          Approve
        </button>
      </div>
    </>
  );
}

function OrderApprovalCard({ id }: { id: string }) {
  const status = useStatus(id) ?? "pending";
  const orderId = resolveOrderIdForApproval(id) ?? id;
  const order = getPendingApprovalOrder(orderId);
  if (!order) return null;

  return (
    <article className="mt-4 rounded-3xl bg-card/70 p-5 shadow-card">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-champagne/15">
          <ShoppingBag className="h-5 w-5 text-champagne" />
        </div>
        <div className="flex-1">
          <div className="text-base font-medium leading-tight">{order.title}</div>
          <div className="text-[11px] text-muted-foreground">
            {order.store} • {categoryLabel(order.category)} • Pending approval
            {order.amountCurrency === "CAD" ? " · priced in CAD" : ""}
          </div>
        </div>
      </div>
      <div className="mt-3">
        <PendingOrderCard order={order} compact />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Monthly budget is checked when you approve. Other-category orders appear under Orders → Other after approval.
      </p>
      {status === "pending" ? <OrderActionButtons id={id} /> : <StatusBanner status={status} />}
    </article>
  );
}

function ApproveAllBar() {
  const ctx = useDecideContext();
  const pending = usePending();
  const [busy, setBusy] = useState(false);
  const [budgetCheck, setBudgetCheck] = useState<BudgetCheck | null>(null);
  const [batchOrderTotal, setBatchOrderTotal] = useState(0);
  const [showBudgetInput, setShowBudgetInput] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  const clearBudgetFlow = () => {
    setBudgetCheck(null);
    setShowBudgetInput(false);
    setInputError(null);
    setBatchOrderTotal(0);
  };

  const finishApproved = (schedules: number, orders: number) => {
    clearBudgetFlow();
    const parts: string[] = [];
    if (schedules > 0) parts.push(`${schedules} event${schedules === 1 ? "" : "s"} on today's schedule`);
    if (orders > 0) parts.push(`${orders} order${orders === 1 ? "" : "s"} on Orders`);
    toast.success(parts.length > 0 ? `Approved — ${parts.join("; ")}` : "All items approved");
  };

  const onDeclineAll = () => {
    setBusy(true);
    clearBudgetFlow();
    try {
      const result = declineAllPendingApprovals();
      if (result.status === "declined") {
        const n = result.schedules + result.orders;
        toast.message(
          n === 0
            ? "Nothing left to decline"
            : `Declined ${n} item${n === 1 ? "" : "s"} — removed from your review queue`,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const onApproveAll = async () => {
    if (!ctx) return;
    setBusy(true);
    setInputError(null);
    try {
      const result = await approveAllPendingApprovals(ctx);
      if (result.status === "needs_budget") {
        setBudgetCheck(result.check);
        setBatchOrderTotal(result.batchOrderTotal);
        setShowBudgetInput(false);
        return;
      }
      if (result.status === "approved") {
        finishApproved(result.schedules, result.orders);
      }
    } finally {
      setBusy(false);
    }
  };

  const onSaveBudgetAndApproveAll = async (amountCad: number) => {
    if (!ctx) return;
    setBusy(true);
    setInputError(null);
    try {
      const result = await approveAllPendingApprovals(ctx, amountCad);
      if (result.status === "invalid_budget") {
        setInputError(result.message);
        return;
      }
      if (result.status === "needs_budget") {
        setBudgetCheck(result.check);
        setBatchOrderTotal(result.batchOrderTotal);
        setShowBudgetInput(false);
        setInputError("That budget is still too low for these orders. Try a higher amount.");
        return;
      }
      if (result.status === "approved") {
        finishApproved(result.schedules, result.orders);
      }
    } finally {
      setBusy(false);
    }
  };

  const inBudgetFlow = Boolean(budgetCheck);

  return (
    <div className="mt-4 rounded-3xl border border-primary/25 bg-card/80 p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Review {pending.length} pending</div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Approve or decline everything in your review queue
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={busy || inBudgetFlow}
            onClick={onDeclineAll}
            className="rounded-full border border-border bg-secondary/50 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Decline All
          </button>
          <button
            type="button"
            disabled={!ctx || busy || inBudgetFlow}
            onClick={() => void onApproveAll()}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
          >
            Approve All
          </button>
        </div>
      </div>
      {budgetCheck && !showBudgetInput && (
        <OrderBudgetPrompt
          check={budgetCheck}
          orderTotal={batchOrderTotal}
          priceSymbol="CA$"
          batchLabel
          onStartRaise={() => {
            setShowBudgetInput(true);
            setInputError(null);
          }}
          onDecline={clearBudgetFlow}
          busy={busy}
        />
      )}
      {budgetCheck && showBudgetInput && (
        <OrderBudgetRaiseForm
          check={budgetCheck}
          busy={busy}
          inputError={inputError}
          onCancel={() => {
            setShowBudgetInput(false);
            setInputError(null);
          }}
          onSave={(amount) => void onSaveBudgetAndApproveAll(amount)}
        />
      )}
    </div>
  );
}

function PendingTab() {
  const pending = usePending();
  const schedulePending = pending.filter(isScheduleApproval);
  const orderPending = pending.filter(isShoppingApproval);

  if (pending.length === 0) {
    return (
      <div className="mt-6 rounded-3xl bg-card/60 p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
          <Check className="h-5 w-5 text-success" />
        </div>
        <div className="text-sm font-medium">You're all caught up</div>
        <p className="mt-1 text-xs text-muted-foreground">New approvals from Simone will appear here.</p>
      </div>
    );
  }

  return (
    <>
      <ApproveAllBar />
      {schedulePending.length > 0 && <SectionLabel>Schedule & events</SectionLabel>}
      {schedulePending.map((p) => (
        <ScheduleApprovalCard key={p.id} id={p.id} item={p} />
      ))}

      {orderPending.length > 0 && <SectionLabel>Shopping & orders</SectionLabel>}
      {orderPending.map((p) => (
        <OrderApprovalCard key={p.id} id={p.id} />
      ))}
    </>
  );
}

function CompletedTab() {
  const decisions = useRecentDecisions();

  const iconFor = (item: PendingItem) =>
    isScheduleApproval(item) ? (
      <Calendar className="h-4 w-4 text-primary" />
    ) : item.kind === "order" || isShoppingApproval(item) ? (
      <Package className="h-4 w-4 text-champagne" />
    ) : (
      <ShoppingBag className="h-4 w-4 text-champagne" />
    );

  const completed: Activity[] = decisions.map((d) => ({
    id: d.id,
    icon: iconFor(d),
    title: d.title,
    detail: d.detail,
    when: formatApprovalDecisionLabel(d.status, d.decidedAt),
    status: d.status,
  }));

  if (completed.length === 0) {
    return (
      <div className="mt-6 rounded-3xl bg-card/60 p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary/60">
          <Check className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="text-sm font-medium">No completed approvals yet</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Approved and declined items will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-3xl bg-card/70 p-4 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">Completed</div>
        <span className="text-[10px] text-muted-foreground">{completed.length} items</span>
      </div>
      <ul className="space-y-2">
        {completed.map((a) => (
          <ActivityRow key={a.id} a={a} showCompletionLabel />
        ))}
      </ul>
    </div>
  );
}
