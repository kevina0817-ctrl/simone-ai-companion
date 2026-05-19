import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  Clock,
  Download,
  Heart,
  LogOut,
  Lock,
  MessageCircle,
  ShieldCheck,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { MobileFrame } from "@/components/MobileFrame";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/hooks/useAuth";
import { getStoredRetentionLabel } from "./privacy.retention";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Center — Simone" }] }),
  component: () => <RequireAuth><PrivacyPage /></RequireAuth>,
});

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative h-6 w-11 rounded-full transition-colors ${value ? "bg-primary" : "bg-secondary"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-foreground shadow-card transition-all ${
          value ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

const access = [
  { Icon: Calendar, title: "Calendar", sub: "View and manage events" },
  { Icon: Heart, title: "Health", sub: "Sleep, activity, and readiness" },
  { Icon: ShoppingCart, title: "Shopping Orders", sub: "Orders, preferences, and budgets" },
  { Icon: MessageCircle, title: "Chat Memory", sub: "Personalized responses" },
];

function PrivacyPage() {
  const { signOut, user } = useAuth();
  const [toggles, setToggles] = useState([true, true, true, false]);
  const [retention, setRetention] = useState("12 months");
  useEffect(() => { setRetention(getStoredRetentionLabel()); }, []);


  return (
    <MobileFrame>
      <div className="px-5">
        <header className="flex items-center justify-between pb-3">
          <button className="rounded-full bg-card/70 p-2"><ArrowLeft className="h-4 w-4" /></button>
          <h1 className="font-display text-xl">Privacy Center</h1>
          <button className="rounded-full bg-card/70 p-2"><ShieldCheck className="h-4 w-4 text-primary" /></button>
        </header>

        <p className="text-sm leading-relaxed text-muted-foreground">
          You're in control of your data. Manage permissions, retention, and settings
          across your AI companion.
        </p>

        <section className="mt-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Data access
          </h2>
          <div className="rounded-3xl bg-card/70 shadow-card">
            {access.map(({ Icon, title, sub }, i) => (
              <div
                key={title}
                className={`flex items-center gap-3 px-4 py-4 ${
                  i < access.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{title}</div>
                  <div className="text-[11px] text-muted-foreground">{sub}</div>
                </div>
                <Toggle
                  value={toggles[i]}
                  onChange={(v) =>
                    setToggles((t) => t.map((x, idx) => (idx === i ? v : x)))
                  }
                />
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Data you control
          </h2>
          <div className="rounded-3xl bg-card/70 shadow-card">
            {[
              { to: "/privacy/retention" as const, Icon: Clock, title: "Retention", sub: retention, color: "text-muted-foreground" },
              { to: "/privacy/export" as const, Icon: Download, title: "Export your data", sub: "Download a copy", color: "text-muted-foreground" },
              { to: "/privacy/delete" as const, Icon: Trash2, title: "Delete your data", sub: "Permanently delete all data", color: "text-destructive" },
            ].map((row, i, arr) => (
              <Link
                key={row.title}
                to={row.to}
                className={`flex w-full items-center gap-3 px-4 py-4 text-left ${
                  i < arr.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/60">
                  <row.Icon className={`h-4 w-4 ${row.color}`} />
                </div>
                <div className="flex-1">
                  <div className={`text-sm font-medium ${row.color === "text-destructive" ? "text-destructive" : ""}`}>
                    {row.title}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{row.sub}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-6 mb-2 overflow-hidden rounded-3xl bg-gradient-to-br from-primary/15 via-card/70 to-champagne/10 p-5 shadow-card">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 shadow-glow">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="font-display text-lg">Secure memory</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Your data is end-to-end encrypted and never used to train models.
                You stay in control — always.
              </p>
            </div>
          </div>
        </section>

        <button
          onClick={signOut}
          className="mt-6 mb-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card/70 px-4 py-3 text-sm text-muted-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out{user?.email ? ` (${user.email})` : ""}
        </button>
      </div>
    </MobileFrame>
  );
}
