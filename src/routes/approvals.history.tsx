import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Calendar, Check, DollarSign, Package, ShoppingBag, Sparkles, X } from "lucide-react";
import { type ReactNode } from "react";
import { MobileFrame } from "@/components/MobileFrame";
import { RequireAuth } from "@/components/RequireAuth";
import { useRecentDecisions } from "@/lib/approvals-store";

export const Route = createFileRoute("/approvals/history")({
  head: () => ({ meta: [{ title: "Approval history — Simone" }] }),
  component: () => <RequireAuth><HistoryPage /></RequireAuth>,
});

type Entry = {
  id: string;
  icon: ReactNode;
  title: string;
  detail: string;
  decidedAt: string;
  decidedBy: "You" | "Simone";
  status: "approved" | "declined";
};

const groups: Array<{ label: string; entries: Entry[] }> = [
  {
    label: "This week",
    entries: [
      { id: "h1", icon: <ShoppingBag className="h-4 w-4 text-success" />, title: "Grocery reorder", detail: "$48.10 • Whole Foods", decidedAt: "Mon 8:14 AM", decidedBy: "You", status: "approved" },
      { id: "h2", icon: <Calendar className="h-4 w-4 text-primary" />, title: "Moved yoga to 7 AM", detail: "Calendar adjustment", decidedAt: "Mon 7:02 AM", decidedBy: "Simone", status: "approved" },
      { id: "h3", icon: <Package className="h-4 w-4 text-champagne" />, title: "Amazon: AirPods case", detail: "$24.99 • 1-day shipping", decidedAt: "Sun 9:41 PM", decidedBy: "You", status: "approved" },
      { id: "h4", icon: <Package className="h-4 w-4 text-muted-foreground" />, title: "Skipped Amazon coffee pods", detail: "Monthly subscription paused", decidedAt: "Sun 9:12 AM", decidedBy: "You", status: "declined" },
    ],
  },
  {
    label: "Last week",
    entries: [
      { id: "h5", icon: <Sparkles className="h-4 w-4 text-primary" />, title: "Booked recovery session", detail: "Sauna + cold plunge • 5:30 PM", decidedAt: "Fri 4:48 PM", decidedBy: "Simone", status: "approved" },
      { id: "h6", icon: <DollarSign className="h-4 w-4 text-success" />, title: "Raised dining budget", detail: "$800 → $900", decidedAt: "Thu 11:20 AM", decidedBy: "You", status: "approved" },
      { id: "h7", icon: <Calendar className="h-4 w-4 text-champagne" />, title: "Declined dentist reschedule", detail: "Kept original Friday slot", decidedAt: "Wed 2:01 PM", decidedBy: "You", status: "declined" },
      { id: "h8", icon: <ShoppingBag className="h-4 w-4 text-success" />, title: "Refilled household supplies", detail: "$32.40 • Amazon", decidedAt: "Tue 9:33 AM", decidedBy: "Simone", status: "approved" },
    ],
  },
  {
    label: "Earlier",
    entries: [
      { id: "h9", icon: <Package className="h-4 w-4 text-champagne" />, title: "New running shoes", detail: "$128.00 • approved budget", decidedAt: "May 3", decidedBy: "You", status: "approved" },
      { id: "h10", icon: <ShoppingBag className="h-4 w-4 text-muted-foreground" />, title: "Cancelled wine club", detail: "Renewal blocked", decidedAt: "Apr 27", decidedBy: "You", status: "declined" },
    ],
  },
];

function Row({ e }: { e: Entry }) {
  const approved = e.status === "approved";
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-card/60 p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary">{e.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{e.title}</div>
        <div className="truncate text-[11px] text-muted-foreground">{e.detail}</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">{e.decidedAt} • by {e.decidedBy}</div>
      </div>
      <div className={`flex h-7 w-7 items-center justify-center rounded-full ${
        approved ? "bg-success/15 text-success" : "bg-risk-high/15 text-risk-high"
      }`}>
        {approved ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
      </div>
    </li>
  );
}

function HistoryPage() {
  const decisions = useRecentDecisions();
  return (
    <MobileFrame>
      <div className="px-5">
        <header className="flex items-center justify-between pb-3">
          <Link to="/approvals" className="rounded-full bg-card/70 p-2">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="font-display text-xl">Approval history</h1>
          <div className="w-8" />
        </header>

        <p className="text-xs text-muted-foreground">
          Everything you and Simone have decided. Tap an item to revisit details.
        </p>

        <div className="mt-4 space-y-5 pb-6">
          {decisions.length > 0 && (
            <section>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Just now
              </div>
              <ul className="space-y-2">
                {decisions.map((d) => (
                  <Row
                    key={d.id}
                    e={{
                      id: d.id,
                      icon: d.kind === "calendar"
                        ? <Calendar className="h-4 w-4 text-primary" />
                        : <ShoppingBag className="h-4 w-4 text-champagne" />,
                      title: d.title,
                      detail: d.detail,
                      decidedAt: new Date(d.decidedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
                      decidedBy: "You",
                      status: d.status,
                    }}
                  />
                ))}
              </ul>
            </section>
          )}
          {groups.map((g) => (
            <section key={g.label}>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {g.label}
              </div>
              <ul className="space-y-2">
                {g.entries.map((e) => <Row key={e.id} e={e} />)}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </MobileFrame>
  );
}
