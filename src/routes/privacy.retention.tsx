import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Clock } from "lucide-react";
import { useState } from "react";
import { MobileFrame } from "@/components/MobileFrame";
import { RequireAuth } from "@/components/RequireAuth";

export const Route = createFileRoute("/privacy/retention")({
  head: () => ({ meta: [{ title: "Retention — Simone" }] }),
  component: () => <RequireAuth><RetentionPage /></RequireAuth>,
});

const options = [
  { id: "6m", label: "6 months", sub: "Minimal footprint" },
  { id: "12m", label: "12 months", sub: "Recommended" },
  { id: "24m", label: "2 years", sub: "More context for Simone" },
  { id: "36m", label: "3 years", sub: "Maximum memory" },
];

function RetentionPage() {
  const [selected, setSelected] = useState("12m");
  return (
    <MobileFrame>
      <div className="px-5">
        <header className="flex items-center justify-between pb-3">
          <Link to="/privacy" className="rounded-full bg-card/70 p-2">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="font-display text-xl">Retention</h1>
          <div className="w-8" />
        </header>

        <p className="text-sm leading-relaxed text-muted-foreground">
          Choose how long Simone keeps your data. Anything older is permanently deleted.
        </p>

        <div className="mt-5 rounded-3xl bg-card/70 shadow-card">
          {options.map((o, i) => {
            const active = selected === o.id;
            return (
              <button
                key={o.id}
                onClick={() => setSelected(o.id)}
                className={`flex w-full items-center gap-3 px-4 py-4 text-left ${
                  i < options.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
                  <Clock className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{o.label}</div>
                  <div className="text-[11px] text-muted-foreground">{o.sub}</div>
                </div>
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary/50"
                  }`}
                >
                  {active && <Check className="h-3.5 w-3.5" />}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-6 rounded-3xl bg-card/50 p-4 text-xs leading-relaxed text-muted-foreground">
          Retention applies to chat memory, calendar suggestions, and shopping history.
          Receipts and approvals required by law are kept for the legally required period.
        </div>
      </div>
    </MobileFrame>
  );
}
