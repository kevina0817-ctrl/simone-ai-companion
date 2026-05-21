import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, ChevronRight, Inbox, Menu, ShoppingBag, SlidersHorizontal } from "lucide-react";
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

function BudgetCard() {
  const spent = 0;
  const [monthly, setMonthly] = useState<number | "unlimited">(800);

  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem("simone:budget");
        if (!raw) return;
        const v = JSON.parse(raw);
        if (v.amount === "unlimited") {
          setMonthly("unlimited");
        } else if (typeof v.amount === "number") {
          const period = v.period ?? "Monthly";
          const factor = period === "Weekly" ? 4 : period === "Quarterly" ? 1 / 3 : 1;
          setMonthly(Math.round(v.amount * factor));
        }
      } catch {
        /* ignore */
      }
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

function OrdersList({ category }: { category?: OrderCategory }) {
  const approvedOrders = useApprovedOrders().filter((o) => !category || o.category === category);

  return (
    <>
      {approvedOrders.map((order) => (
        <PendingOrderCard key={order.id} order={order} />
      ))}
      {approvedOrders.length === 0 && (
        <EmptyState
          title={category ? `No ${category} orders` : "No orders yet"}
          hint="Approve a grocery or shopping order from Simone to see it here."
        />
      )}
    </>
  );
}

function TabContent({ tab }: { tab: Tab }) {
  const lists: Record<Tab, ReactNode> = {
    All: <OrdersList />,
    Grocery: <OrdersList category="grocery" />,
    Amazon: <OrdersList category="amazon" />,
    Other: <OrdersList category="other" />,
  };

  return (
    <>
      {lists[tab]}
      <BudgetCard />
    </>
  );
}

function OrdersPage() {
  const [tab, setTab] = useState<Tab>("All");

  return (
    <MobileFrame>
      <div className="px-5">
        <header className="flex items-center justify-between pb-3">
          <button type="button" className="rounded-full bg-card/70 p-2">
            <Menu className="h-4 w-4" />
          </button>
          <h1 className="font-display text-xl">Orders</h1>
          <button type="button" className="rounded-full bg-card/70 p-2">
            <Bell className="h-4 w-4" />
          </button>
        </header>

        <div className="flex gap-1 rounded-full bg-card/60 p-1">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <TabContent tab={tab} />
      </div>
    </MobileFrame>
  );
}
