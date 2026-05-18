import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Calendar, ChevronRight, Filter, History, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { MobileFrame } from "@/components/MobileFrame";

export const Route = createFileRoute("/approvals")({
  head: () => ({ meta: [{ title: "Approvals — Aura" }] }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const [tab, setTab] = useState<"needs" | "all">("needs");
  return (
    <MobileFrame>
      <div className="px-5">
        <header className="flex items-center justify-between pb-3">
          <button className="rounded-full bg-card/70 p-2"><ArrowLeft className="h-4 w-4" /></button>
          <h1 className="flex items-center gap-2 font-display text-xl">
            Approvals
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              2
            </span>
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
              onClick={() => setTab(t.id as "needs" | "all")}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Card 1 */}
        <article className="mt-4 rounded-3xl bg-card/70 p-5 shadow-card">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-champagne/15">
              <Calendar className="h-5 w-5 text-champagne" />
            </div>
            <div className="flex-1">
              <div className="text-base font-medium leading-tight">
                Calendar change: move client meeting
              </div>
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
                  <div
                    key={i}
                    className="h-7 w-7 rounded-full border-2 border-card"
                    style={{ background: c }}
                  />
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

          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-full border border-border bg-secondary/50 py-2.5 text-sm font-medium">
              Decline
            </button>
            <button className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-glow">
              Approve
            </button>
          </div>
        </article>

        {/* Card 2 */}
        <article className="mt-4 rounded-3xl bg-card/70 p-5 shadow-card">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-champagne/15">
              <ShoppingBag className="h-5 w-5 text-champagne" />
            </div>
            <div className="flex-1">
              <div className="text-base font-medium leading-tight">
                Grocery budget over limit
              </div>
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

          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-full border border-border bg-secondary/50 py-2.5 text-sm font-medium">
              Decline
            </button>
            <button className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-glow">
              Approve
            </button>
          </div>
        </article>

        <button className="mt-4 flex w-full items-center justify-between rounded-2xl bg-card/50 px-4 py-3 text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <History className="h-4 w-4" /> Approval history
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </MobileFrame>
  );
}
