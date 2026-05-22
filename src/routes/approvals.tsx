import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Calendar, Check, DollarSign, Filter, Package, ShoppingBag, Sparkles, X } from "lucide-react";
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
  useRecentDecisions,
  useStatus,
  type ApprovalsDecideContext,
  type PendingItem,
} from "@/lib/approvals-store";
import type { OrderCategory } from "@/lib/order-category";
import type { BudgetCheck } from "@/lib/budget-store";
import {
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

type Tab = "needs" | "all";

type Activity = {
  id: string;
  icon: ReactNode;
  title: string;
  detail: string;
  when: string;
  status: "approved" | "declined" | "auto";
};

const recentActivity: Activity[] = [
  { id: "a1", icon: <ShoppingBag className="h-4 w-4 text-success" />, title: "Grocery reorder", detail: "$48.10 • Whole Foods", when: "2h ago", status: "approved" },
  { id: "a2", icon: <Calendar className="h-4 w-4 text-primary" />, title: "Moved yoga to 7 AM", detail: "Calendar adjustment", when: "Today", status: "approved" },
  { id: "a3", icon: <Package className="h-4 w-4 text-champagne" />, title: "Amazon: AirPods case", detail: "$24.99 • 1-day shipping", when: "Yesterday", status: "approved" },
  { id: "a4", icon: <DollarSign className="h-4 w-4 text-success" />, title: "Paused dining budget alert", detail: "Threshold raised to $900", when: "Yesterday", status: "auto" },
  { id: "a5", icon: <Sparkles className="h-4 w-4 text-primary" />, title: "Booked recovery session", detail: "Sauna + cold plunge • 5:30 PM", when: "2 days ago", status: "approved" },
  { id: "a6", icon: <Package className="h-4 w-4 text-muted-foreground" />, title: "Skipped Amazon subscription", detail: "Coffee pods • monthly", when: "3 days ago", status: "declined" },
];

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

function ActivityRow({ a }: { a: Activity }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-card/60 p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary">{a.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{a.title}</div>
        <div className="truncate text-[11px] text-muted-foreground">{a.detail}</div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusChip[a.status]}`}>
          {statusLabel[a.status]}
        </span>
        <span className="text-[10px] text-muted-foreground">{a.when}</span>
      </div>
    </li>
  );
}

function ApprovalsPage() {
  const [tab, setTab] = useState<Tab>("needs");
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
            { id: "needs", label: "Needs your review" },
            { id: "all", label: "All activity" },
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

        {tab === "needs" ? <NeedsReview /> : <AllActivity />}
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
  const status = useStatus(id);
  const ev = item.scheduleEvent;
  if (!ev) return null;

  const when = new Date(ev.start_time).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <article className="mt-4 rounded-3xl bg-card/70 p-5 shadow-card">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15">
          <Calendar className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <div className="text-base font-medium leading-tight">{ev.title}</div>
          <div className="text-[11px] text-muted-foreground">Schedule • Adds to today&apos;s timeline when approved</div>
        </div>
        <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-medium text-primary">
          {ev.level}
        </span>
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
  onStartRaise,
  onDecline,
  busy,
}: {
  check: BudgetCheck;
  orderTotal: number;
  priceSymbol: string;
  onStartRaise: () => void;
  onDecline: () => void;
  busy: boolean;
}) {
  const cap = check.monthlyCap === "unlimited" ? 0 : check.monthlyCap;
  const overBy = check.overBy;

  return (
    <div className="mt-4 rounded-2xl border border-risk-medium/40 bg-risk-medium/10 px-4 py-3 text-sm">
      <p className="leading-relaxed text-foreground">
        {overBy > 0
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
  const status = useStatus(id);
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

function NeedsReview() {
  const calStatus = useStatus("p-cal-1");
  const groStatus = useStatus("p-gro-1");
  const pending = usePending();
  const schedulePending = pending.filter(isScheduleApproval);
  const orderPending = pending.filter(isShoppingApproval);
  const legacyPending = pending.filter((p) => !p.orderId && !p.scheduleEvent);

  if (pending.length === 0 && calStatus !== "approved" && groStatus !== "approved") {
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
      {schedulePending.length > 0 && <SectionLabel>Schedule & events</SectionLabel>}
      {schedulePending.map((p) => (
        <ScheduleApprovalCard key={p.id} id={p.id} item={p} />
      ))}

      {orderPending.length > 0 && <SectionLabel>Shopping & orders</SectionLabel>}
      {orderPending.map((p) => (
        <OrderApprovalCard key={p.id} id={p.id} />
      ))}

      {legacyPending.length > 0 && <SectionLabel>Other</SectionLabel>}
      {calStatus !== "declined" && legacyPending.some((p) => p.id === "p-cal-1") && (
        <article className="mt-4 rounded-3xl bg-card/70 p-5 shadow-card">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-champagne/15">
              <Calendar className="h-5 w-5 text-champagne" />
            </div>
            <div className="flex-1">
              <div className="text-base font-medium leading-tight">Calendar change: move client meeting</div>
            </div>
            <span className="rounded-full border border-risk-high/40 bg-risk-high/10 px-2.5 py-1 text-[10px] font-medium text-risk-high">
              High risk
            </span>
          </div>

          <div className="mt-4 space-y-3 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Reason</div>
              <div>Reschedules a meeting with 5 attendees.</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Affected</div>
              <div className="mt-1.5 flex -space-x-2">
                {["#C9C2FF", "#E9D5A6", "#9FBFA4", "#D8A6B5", "#A6BFE9"].map((c, i) => (
                  <div key={i} className="h-7 w-7 rounded-full border-2 border-card" style={{ background: c }} />
                ))}
                <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-secondary text-[10px] text-muted-foreground">
                  +1
                </div>
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Details</div>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                <li>• From: Today, May 16 at 2:00 PM</li>
                <li>• To: Tomorrow, May 17 at 10:00 AM</li>
              </ul>
            </div>
          </div>

          {calStatus === "pending" ? <ActionButtons id="p-cal-1" /> : <StatusBanner status={calStatus} />}
        </article>
      )}

      {groStatus !== "declined" && legacyPending.some((p) => p.id === "p-gro-1") && (
        <article className="mt-4 rounded-3xl bg-card/70 p-5 shadow-card">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-champagne/15">
              <ShoppingBag className="h-5 w-5 text-champagne" />
            </div>
            <div className="flex-1">
              <div className="text-base font-medium leading-tight">Grocery budget over limit</div>
            </div>
            <span className="rounded-full border border-risk-medium/40 bg-risk-medium/10 px-2.5 py-1 text-[10px] font-medium text-risk-medium">
              Medium risk
            </span>
          </div>

          <div className="mt-4 space-y-3 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Reason</div>
              <div>Order total exceeds monthly grocery budget.</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Over by</div>
              <div className="font-display text-xl">$24.31 <span className="text-sm text-muted-foreground">(5.4%)</span></div>
            </div>
          </div>

          {groStatus === "pending" ? <ActionButtons id="p-gro-1" /> : <StatusBanner status={groStatus} />}
        </article>
      )}
    </>
  );
}

function AllActivity() {
  const pending = usePending();
  const decisions = useRecentDecisions();

  const iconFor = (item: PendingItem) =>
    isScheduleApproval(item) ? (
      <Calendar className="h-4 w-4 text-primary" />
    ) : item.kind === "order" || isShoppingApproval(item) ? (
      <Package className="h-4 w-4 text-champagne" />
    ) : (
      <ShoppingBag className="h-4 w-4 text-champagne" />
    );

  const justDecided: Activity[] = decisions.map((d) => ({
    id: d.id,
    icon: iconFor(d),
    title: d.title,
    detail: d.detail,
    when: new Date(d.decidedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    status: d.status,
  }));

  return (
    <>
      <div className="mt-4 rounded-3xl bg-card/70 p-4 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground">Pending</div>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
            {pending.length} waiting
          </span>
        </div>
        {pending.length > 0 ? (
          <ul className="space-y-2">
            {pending.map((p) => (
              <ActivityRow
                key={p.id}
                a={{ id: p.id, icon: iconFor(p), title: p.title, detail: p.detail, when: "Now", status: "auto" }}
              />
            ))}
          </ul>
        ) : (
          <p className="px-1 py-2 text-xs text-muted-foreground">Nothing waiting on you.</p>
        )}
      </div>

      <div className="mt-4 rounded-3xl bg-card/70 p-4 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground">Recent</div>
          <span className="text-[10px] text-muted-foreground">{justDecided.length + recentActivity.length} items</span>
        </div>
        <ul className="space-y-2">
          {justDecided.map((a) => <ActivityRow key={a.id} a={a} />)}
          {recentActivity.map((a) => <ActivityRow key={a.id} a={a} />)}
        </ul>
      </div>
    </>
  );
}
