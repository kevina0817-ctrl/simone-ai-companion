import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { MobileFrame } from "@/components/MobileFrame";
import { RequireAuth } from "@/components/RequireAuth";

export const Route = createFileRoute("/privacy/retention")({
  head: () => ({ meta: [{ title: "Retention — Simone" }] }),
  component: () => <RequireAuth><RetentionPage /></RequireAuth>,
});

export const RETENTION_OPTIONS = [
  { id: "6m", label: "6 months", sub: "Minimal footprint" },
  { id: "12m", label: "12 months", sub: "Recommended" },
  { id: "24m", label: "2 years", sub: "More context for Simone" },
  { id: "36m", label: "3 years", sub: "Maximum memory" },
  { id: "forever", label: "Forever", sub: "Never auto-delete" },
];
const options = RETENTION_OPTIONS;
export const RETENTION_STORAGE_KEY = "simone.retention";

const STORAGE_KEY = "simone.retention";
export function getStoredRetentionLabel() {
  if (typeof window === "undefined") return "12 months";
  const id = window.localStorage.getItem(STORAGE_KEY) ?? "12m";
  return options.find((o) => o.id === id)?.label ?? "12 months";
}

function RetentionPage() {
  const [selected, setSelected] = useState("12m");
  const [saved, setSaved] = useState(false);
  const [autoDelete, setAutoDelete] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setSelected(stored);
  }, []);

  const save = () => {
    window.localStorage.setItem(STORAGE_KEY, selected);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <MobileFrame>
      <div className="px-5 pb-8">
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

        <div className="mt-4 flex items-center justify-between rounded-2xl bg-card/70 px-4 py-3 shadow-card">
          <div>
            <div className="text-sm font-medium">Auto-delete older data</div>
            <div className="text-[11px] text-muted-foreground">Runs nightly in the background</div>
          </div>
          <button
            onClick={() => setAutoDelete((v) => !v)}
            className={`relative h-6 w-11 rounded-full transition-colors ${autoDelete ? "bg-primary" : "bg-secondary"}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-foreground shadow-card transition-all ${
                autoDelete ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>

        <button
          onClick={save}
          className="mt-5 w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-glow"
        >
          {saved ? "Saved ✓" : "Save retention"}
        </button>

        <div className="mt-5 rounded-3xl bg-card/50 p-4 text-xs leading-relaxed text-muted-foreground">
          Retention applies to chat memory, calendar suggestions, and shopping history.
          Receipts and approvals required by law are kept for the legally required period.
        </div>
      </div>
    </MobileFrame>
  );
}
