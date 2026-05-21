import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Check, ChevronRight, Inbox, MapPin, Menu, ShoppingBag, SlidersHorizontal, Truck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { MobileFrame } from "@/components/MobileFrame";
import { RequireAuth } from "@/components/RequireAuth";
import { PendingOrderCard } from "@/components/PendingOrderCard";
import type { OrderCategory } from "@/lib/pending-order";
import { useApprovedOrders } from "@/lib/pending-orders-store";

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "Orders — Simone" }] }),
  component: () => <RequireAuth><OrdersPage /></RequireAuth>,
});

const tabs = ["All", "Grocery", "Amazon", "Other"] as const;
type Tab = (typeof tabs)[number];
const stages = ["Confirmed", "Packed", "On the way", "Delivered"];

type GroceryItem = { name: string; qty: number; price: number };

const GROCERY_ORDER = {
  orderId: "8803",
  store: "Whole Foods",
  eta: "Arriving tomorrow",
  items: [
    { name: "Bananas (organic)", qty: 1, price: 2.49 },
    { name: "Atlantic salmon fillet", qty: 1, price: 14.99 },
    { name: "Baby spinach", qty: 2, price: 7.0 },
    { name: "Whole milk, 1 gal", qty: 1, price: 4.29 },
    { name: "Sourdough loaf", qty: 1, price: 5.5 },
    { name: "Free-range eggs, dozen", qty: 1, price: 6.49 },
    { name: "Greek yogurt (sub)", qty: 1, price: 5.99 },
    { name: "Avocado", qty: 3, price: 4.5 },
  ] as GroceryItem[],
  substitution: "Greek yogurt instead of plain yogurt",
};

function GroceryCard() {
  const { orderId, store, eta, items, substitution } = GROCERY_ORDER;
  const itemCount = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.price, 0);

  return (
    <div className="mt-4 rounded-3xl bg-card/70 p-5 shadow-card">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-medium">Grocery order</div>
          <div className="text-[11px] text-muted-foreground">
            {store} • Order #{orderId} • {itemCount} items
            {substitution ? " • 1 substitution" : ""}
          </div>
        </div>
        <span className="rounded-full bg-success/15 px-2.5 py-1 text-[10px] font-medium text-success">
          {eta}
        </span>
      </div>

      <div className="mt-3 rounded-2xl border border-border/60 bg-background/40 p-3 font-mono text-[11px]">
        <ul className="divide-y divide-border/50">
          {items.map((it, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="flex-1 truncate">
                {it.qty > 1 ? <span className="text-muted-foreground">{it.qty}× </span> : null}
                {it.name}
              </span>
              <span className="tabular-nums">${it.price.toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-baseline justify-between border-t border-border/60 pt-2">
          <span className="text-muted-foreground">Total</span>
          <span className="tabular-nums font-medium">${subtotal.toFixed(2)}</span>
        </div>
      </div>

      {substitution && (
        <div className="mt-3 rounded-xl bg-success/10 px-3 py-2 text-[11px] text-success">
          Substitution: {substitution}
        </div>
      )}
    </div>
  );
}

function GroceryTracking() {
  const grocerySteps = ["Ordered", "Picking", "Out for delivery", "Delivered"];
  const idx = 1;
  return (
    <div className="mt-4 rounded-3xl bg-card/70 p-5 shadow-card">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-base font-medium">Whole Foods • Order #8803</div>
          <div className="text-xs text-muted-foreground">Shopper picking now • ETA tomorrow 9:30 AM</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/20">
          <ShoppingBag className="h-5 w-5 text-success" />
        </div>
      </div>
      <ul className="mt-4 space-y-2.5">
        {grocerySteps.map((s, i) => (
          <li key={s} className="flex items-center gap-3">
            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${
              i <= idx ? "bg-success text-background" : "bg-secondary text-muted-foreground"
            }`}>
              {i <= idx ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <span className={`text-sm ${i <= idx ? "" : "text-muted-foreground"}`}>{s}</span>
            {i === idx && <span className="ml-auto text-[10px] text-success">Now</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

type AmazonItem = { name: string; qty: number; price: number };

const AMAZON_ORDER = {
  orderId: "114-7829012-3103456",
  carrier: "Amazon Logistics",
  etaText: "Arriving in 28 min",
  stageIdx: 2, // 0..3 → Confirmed / Packed / On the way / Delivered
  courier: { name: "Alex", vehicle: "Van • ABT-4821" },
  shipTo: "Home • 221B Baker St, Apt 4",
  items: [
    { name: "USB-C cable, 2m", qty: 2, price: 9.99 },
    { name: "Anker 65W charger", qty: 1, price: 39.99 },
    { name: "Kindle Paperwhite cover", qty: 1, price: 24.5 },
  ] as AmazonItem[],
  shipping: 0,
};

function AmazonTracking() {
  const { orderId, carrier, etaText, stageIdx, courier, shipTo, items, shipping } = AMAZON_ORDER;
  const itemCount = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const total = subtotal + shipping;

  return (
    <div className="mt-4 rounded-3xl bg-card/70 p-5 shadow-card">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-base font-medium">Amazon delivery</div>
          <div className="text-xs text-muted-foreground">
            Order #{orderId} • {etaText}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {carrier} • {itemCount} items • Ship to {shipTo}
          </div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
          <Truck className="h-5 w-5 text-primary" />
        </div>
      </div>

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

      <div className="mt-4 rounded-2xl border border-border/60 bg-background/40 p-3 font-mono text-[11px]">
        <ul className="divide-y divide-border/50">
          {items.map((it, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="flex-1 truncate">
                {it.qty > 1 ? <span className="text-muted-foreground">{it.qty}× </span> : null}
                {it.name}
              </span>
              <span className="tabular-nums">${(it.price * it.qty).toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-baseline justify-between text-muted-foreground">
          <span>Shipping</span>
          <span className="tabular-nums">{shipping === 0 ? "Free" : `$${shipping.toFixed(2)}`}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between border-t border-border/60 pt-2">
          <span className="text-muted-foreground">Total</span>
          <span className="tabular-nums font-medium">${total.toFixed(2)}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-champagne to-primary" />
        <div className="text-xs">
          <div className="text-muted-foreground">Courier</div>
          <div className="font-medium">{courier.name}</div>
        </div>
        <div className="ml-3 text-[11px] text-muted-foreground">{courier.vehicle}</div>
        <button className="ml-auto flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-2 text-xs font-medium">
          <MapPin className="h-3.5 w-3.5" /> Details
        </button>
      </div>
    </div>
  );
}

function BudgetCard() {
  const spent = 736;
  const [monthly, setMonthly] = useState<number | "unlimited">(800);

  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem("simone:budget");
        if (!raw) return;
        const v = JSON.parse(raw);
        // Always show monthly target. If saved period is monthly, use its amount; otherwise normalize.
        if (v.amount === "unlimited") {
          setMonthly("unlimited");
        } else if (typeof v.amount === "number") {
          const period = v.period ?? "Monthly";
          const factor = period === "Weekly" ? 4 : period === "Quarterly" ? 1 / 3 : 1;
          setMonthly(Math.round(v.amount * factor));
        }
      } catch { /* ignore */ }
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("focus", read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("focus", read);
    };
  }, []);

  const unlimited = monthly === "unlimited";
  const pct = unlimited ? 0 : Math.min(100, Math.round((spent / (monthly as number)) * 100));

  return (
    <div className="mt-4 rounded-3xl bg-card/70 p-5 shadow-card">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-champagne/20">
          <ShoppingBag className="h-5 w-5 text-champagne" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium">Budget threshold</div>
          <div className="text-[11px] text-muted-foreground">
            {unlimited
              ? "Unlimited monthly budget — track spending freely."
              : `You've spent ${pct}% of your monthly budget.`}
          </div>
        </div>
        <div className="text-right text-xs font-medium">
          ${spent}
          <span className="text-muted-foreground"> / {unlimited ? "∞" : `$${monthly}`}</span>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-champagne"
          style={{ width: unlimited ? "20%" : `${pct}%` }}
        />
      </div>
      <Link
        to="/orders/budget"
        className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-secondary/40 px-3 py-2.5"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-card">
          <SlidersHorizontal className="h-4 w-4" />
        </div>
        <div className="flex-1 text-left">
          <div className="text-xs font-medium">Set your budget</div>
          <div className="text-[10px] text-muted-foreground">Choose period, cap, and category limits</div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mt-6 flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
        <Inbox className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="mt-3 text-sm font-medium">{title}</div>
      <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function ApprovedOrdersBlock({ category }: { category?: OrderCategory }) {
  const approvedOrders = useApprovedOrders().filter(
    (o) => !category || o.category === category,
  );
  if (approvedOrders.length === 0) return null;
  return (
    <>
      {approvedOrders.map((order) => (
        <PendingOrderCard key={order.id} order={order} />
      ))}
    </>
  );
}

function OrdersPage() {
  const [tab, setTab] = useState<Tab>("All");

  const content: Record<Tab, ReactNode> = {
    All: (
      <>
        <ApprovedOrdersBlock />
        <AmazonTracking />
        <GroceryCard />
        <BudgetCard />
      </>
    ),
    Grocery: (
      <>
        <ApprovedOrdersBlock category="grocery" />
        <GroceryTracking />
        <GroceryCard />
      </>
    ),
    Amazon: <AmazonTracking />,
    Other: (
      <EmptyState
        title="No other orders"
        hint="Pharmacy, hardware, and one-off orders will show up here."
      />
    ),
  };

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

        {content[tab]}
      </div>
    </MobileFrame>
  );
}
