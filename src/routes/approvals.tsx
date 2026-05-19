import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Calendar, Check, DollarSign, Filter, Package, ShoppingBag, Sparkles, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { MobileFrame } from "@/components/MobileFrame";
import { RequireAuth } from "@/components/RequireAuth";
import { decide, usePending, useStatus } from "@/lib/approvals-store";

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

function ActionButtons({ id }: { id: string }) {
  return (
    <div className="mt-4 flex gap-2">
      <button onClick={() => decide(id, "declined")} className="flex-1 rounded-full border border-border bg-secondary/50 py-2.5 text-sm font-medium">Decline</button>
      <button onClick={() => decide(id, "approved")} className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-glow">Approve</button>
    </div>
  );
}

function NeedsReview() {
  const calStatus = useStatus("p-cal-1");
  const groStatus = useStatus("p-gro-1");
  const pending = usePending();

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
      {calStatus !== "declined" && (
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

      {groStatus !== "declined" && (
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
  return (
    <>
      <div className="mt-4 rounded-3xl bg-card/70 p-4 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground">Pending</div>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">2 waiting</span>
        </div>
        <ul className="space-y-2">
          <ActivityRow a={{ id: "p1", icon: <Calendar className="h-4 w-4 text-champagne" />, title: "Move client meeting", detail: "Today 2 PM → Tomorrow 10 AM", when: "Now", status: "auto" }} />
          <ActivityRow a={{ id: "p2", icon: <ShoppingBag className="h-4 w-4 text-champagne" />, title: "Grocery budget over limit", detail: "+$24.31 over monthly", when: "Now", status: "auto" }} />
        </ul>
      </div>

      <div className="mt-4 rounded-3xl bg-card/70 p-4 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground">Recent</div>
          <Link to="/approvals/history" className="text-[10px] text-primary">View all</Link>
        </div>
        <ul className="space-y-2">
          {recentActivity.map((a) => <ActivityRow key={a.id} a={a} />)}
        </ul>
      </div>
    </>
  );
}
