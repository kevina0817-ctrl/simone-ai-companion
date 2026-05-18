import { createFileRoute } from "@tanstack/react-router";
import { Bell, Check, MapPin, Menu, ShoppingBag, Truck } from "lucide-react";
import { useState } from "react";
import { MobileFrame } from "@/components/MobileFrame";
import { RequireAuth } from "@/components/RequireAuth";

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "Orders — Aura" }] }),
  component: () => <RequireAuth><OrdersPage /></RequireAuth>,
});

const tabs = ["All", "Grocery", "Amazon", "Other"] as const;
const stages = ["Confirmed", "Packed", "On the way", "Delivered"];

function OrdersPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("All");
  const stageIdx = 2;

  return (
    <MobileFrame>
      <div className="px-5">
        <header className="flex items-center justify-between pb-3">
          <button className="rounded-full bg-card/70 p-2"><Menu className="h-4 w-4" /></button>
          <h1 className="font-display text-xl">Orders</h1>
          <button className="rounded-full bg-card/70 p-2"><Bell className="h-4 w-4" /></button>
        </header>

        <div className="flex gap-1 rounded-full bg-card/60 p-1">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Delivery card */}
        <div className="mt-4 rounded-3xl bg-card/70 p-5 shadow-card">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-base font-medium">Delivery on the way</div>
              <div className="text-xs text-muted-foreground">Arriving in 28 min</div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
              <Truck className="h-5 w-5 text-primary" />
            </div>
          </div>

          {/* faux map */}
          <div className="relative mt-4 h-32 overflow-hidden rounded-2xl bg-gradient-to-br from-secondary to-background">
            <svg className="absolute inset-0 h-full w-full opacity-30" viewBox="0 0 200 100" preserveAspectRatio="none">
              <defs>
                <pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="200" height="100" fill="url(#g)" />
              <path d="M0,70 Q40,50 70,55 T130,40 T200,30" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeDasharray="2 2" />
            </svg>
            <div className="absolute right-6 top-6 flex h-8 w-8 items-center justify-center rounded-full bg-primary shadow-glow">
              <Truck className="h-4 w-4 text-primary-foreground" />
            </div>
          </div>

          {/* progress */}
          <div className="mt-4 flex items-center">
            {stages.map((s, i) => (
              <div key={s} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${
                      i <= stageIdx ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {i <= stageIdx ? <Check className="h-3 w-3" /> : i + 1}
                  </div>
                  <span className="mt-1.5 text-[9px] text-muted-foreground">{s}</span>
                </div>
                {i < stages.length - 1 && (
                  <div className={`mx-1 h-px flex-1 ${i < stageIdx ? "bg-primary" : "bg-border"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Amazon */}
        <div className="mt-4 rounded-3xl bg-card/70 p-5 shadow-card">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm font-medium">Amazon package</div>
              <div className="text-[11px] text-muted-foreground">Order #114-7829012-3103456</div>
              <div className="mt-3 flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-champagne to-primary" />
                <div className="text-xs">
                  <div className="text-muted-foreground">Courier</div>
                  <div className="font-medium">Alex</div>
                </div>
              </div>
            </div>
          </div>
          <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-border bg-secondary/50 py-2.5 text-sm font-medium">
            <MapPin className="h-4 w-4" /> Track on map
          </button>
        </div>

        {/* Grocery */}
        <div className="mt-4 rounded-3xl bg-card/70 p-5 shadow-card">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm font-medium">Grocery order</div>
              <div className="text-[11px] text-muted-foreground">Order #8803 • 8 items • 1 substitution</div>
            </div>
            <span className="rounded-full bg-success/15 px-2.5 py-1 text-[10px] font-medium text-success">
              Arriving tomorrow
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            {["🍌", "🐟", "🥬", "🥛"].map((e, i) => (
              <div key={i} className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-xl">
                {e}
              </div>
            ))}
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border text-xs text-muted-foreground">
              +4
            </div>
          </div>
          <div className="mt-3 rounded-xl bg-success/10 px-3 py-2 text-[11px] text-success">
            Substitution: Greek yogurt instead of plain yogurt
          </div>
        </div>

        {/* Budget */}
        <div className="mt-4 rounded-3xl bg-card/70 p-5 shadow-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-champagne/20">
              <ShoppingBag className="h-5 w-5 text-champagne" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">Budget threshold</div>
              <div className="text-[11px] text-muted-foreground">You've spent 92% of your monthly budget.</div>
            </div>
            <div className="text-right text-xs font-medium">$736<span className="text-muted-foreground"> / $800</span></div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-champagne" style={{ width: "92%" }} />
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}
