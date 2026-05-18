import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Trash2 } from "lucide-react";
import { useState } from "react";
import { MobileFrame } from "@/components/MobileFrame";
import { RequireAuth } from "@/components/RequireAuth";

export const Route = createFileRoute("/privacy/delete")({
  head: () => ({ meta: [{ title: "Delete your data — Simone" }] }),
  component: () => <RequireAuth><DeletePage /></RequireAuth>,
});

const scopes = [
  { id: "chat", label: "Chat memory only", sub: "Reset what Simone remembers" },
  { id: "shop", label: "Shopping history", sub: "Orders, preferences, budgets" },
  { id: "all", label: "Everything", sub: "Delete account and all data" },
];

function DeletePage() {
  const [scope, setScope] = useState("chat");
  const [confirm, setConfirm] = useState("");
  const required = scope === "all" ? "DELETE" : "CONFIRM";

  return (
    <MobileFrame>
      <div className="px-5">
        <header className="flex items-center justify-between pb-3">
          <Link to="/privacy" className="rounded-full bg-card/70 p-2">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="font-display text-xl">Delete your data</h1>
          <div className="w-8" />
        </header>

        <div className="mt-2 flex items-start gap-3 rounded-3xl border border-risk-high/30 bg-risk-high/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-risk-high" />
          <div>
            <div className="font-medium text-risk-high">This cannot be undone</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Deleted data is removed from memory, backups, and analytics within 30 days.
            </div>
          </div>
        </div>

        <section className="mt-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">What to delete</h2>
          <div className="rounded-3xl bg-card/70 shadow-card">
            {scopes.map((s, i) => {
              const active = scope === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => { setScope(s.id); setConfirm(""); }}
                  className={`flex w-full items-center gap-3 px-4 py-4 text-left ${
                    i < scopes.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  <div className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${
                    active ? "border-primary bg-primary" : "border-border"
                  }`} />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{s.label}</div>
                    <div className="text-[11px] text-muted-foreground">{s.sub}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-5">
          <label className="text-xs font-medium text-muted-foreground">
            Type <span className="font-mono text-foreground">{required}</span> to confirm
          </label>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={required}
            className="mt-2 w-full rounded-2xl border border-border bg-card/70 px-4 py-3 text-sm outline-none focus:border-primary"
          />
        </section>

        <button
          disabled={confirm !== required}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-risk-high py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
          {scope === "all" ? "Delete account" : "Delete selected data"}
        </button>
      </div>
    </MobileFrame>
  );
}
