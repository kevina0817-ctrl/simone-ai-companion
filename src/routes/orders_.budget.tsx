import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { MobileFrame } from "@/components/MobileFrame";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

export const Route = createFileRoute("/orders_/budget")({
  head: () => ({ meta: [{ title: "Set your budget — Simone" }] }),
  component: () => <RequireAuth><BudgetPage /></RequireAuth>,
});

const PERIODS = ["Weekly", "Monthly", "Quarterly"] as const;
type Period = (typeof PERIODS)[number];

const CATEGORIES = [
  { key: "grocery", label: "Grocery", emoji: "🥬" },
  { key: "amazon", label: "Amazon", emoji: "📦" },
  { key: "others", label: "Others", emoji: "🛍️" },
];

const PRESETS: Record<Period, { amount: number; cats: Record<string, number> }> = {
  Weekly:    { amount: 200,  cats: { grocery: 100, amazon: 60,  others: 40  } },
  Monthly:   { amount: 800,  cats: { grocery: 400, amazon: 250, others: 150 } },
  Quarterly: { amount: 2400, cats: { grocery: 1200, amazon: 750, others: 450 } },
};

function BudgetPage() {
  const navigate = useNavigate();
  const [period, setPeriodState] = useState<Period>("Monthly");
  const [amount, setAmount] = useState<number>(PRESETS.Monthly.amount);
  const [alertAt, setAlertAt] = useState<number>(90);
  const [cats, setCats] = useState<Record<string, number>>(PRESETS.Monthly.cats);
  const [saved, setSaved] = useState(false);

  const setPeriod = (p: Period) => {
    setPeriodState(p);
    setAmount(PRESETS[p].amount);
    setCats(PRESETS[p].cats);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem("simone:budget");
      if (raw) {
        const v = JSON.parse(raw);
        if (v.period) setPeriodState(v.period);
        if (typeof v.amount === "number") setAmount(v.amount);
        if (typeof v.alertAt === "number") setAlertAt(v.alertAt);
        if (v.cats) setCats({ ...PRESETS[(v.period as Period) ?? "Monthly"].cats, ...v.cats });
      }
    } catch { /* ignore */ }
  }, []);

  const total = Object.values(cats).reduce((a, b) => a + b, 0);

  const save = () => {
    localStorage.setItem(
      "simone:budget",
      JSON.stringify({ period, amount, alertAt, cats }),
    );
    setSaved(true);
    setTimeout(() => navigate({ to: "/orders" }), 900);
  };

  return (
    <MobileFrame>
      <div className="px-5 pb-8">
        <header className="flex items-center justify-between pb-3">
          <Link to="/orders" className="rounded-full bg-card/70 p-2">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="font-display text-xl">Set your budget</h1>
          <div className="h-8 w-8" />
        </header>

        {/* Period */}
        <div className="mt-2 flex gap-1 rounded-full bg-card/60 p-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Total amount */}
        <div className="mt-4 rounded-3xl bg-card/70 p-5 shadow-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-champagne/20">
              <ShoppingBag className="h-5 w-5 text-champagne" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">{period} budget</div>
              <div className="text-[11px] text-muted-foreground">Total cap across all categories</div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="text-2xl font-display">$</span>
            <Input
              type="text"
              inputMode="numeric"
              value={amount === Infinity ? "∞" : amount}
              disabled={amount === Infinity}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/[^\d]/g, ""));
                setAmount(Math.max(0, Number.isFinite(n) ? n : 0));
              }}
              className="h-12 text-2xl font-display"
            />
            <button
              type="button"
              onClick={() =>
                setAmount(amount === Infinity ? PRESETS[period].amount : Infinity)
              }
              className={`shrink-0 rounded-full px-3 py-2 text-[11px] font-medium transition-colors ${
                amount === Infinity
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-secondary/50 text-muted-foreground"
              }`}
            >
              Unlimited
            </button>
          </div>
          {amount !== Infinity && (
            <div className="mt-4">
              <Slider
                value={[amount]}
                min={50}
                max={10000}
                step={50}
                onValueChange={(v) => setAmount(v[0])}
              />
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>$50</span><span>$10,000+</span>
              </div>
            </div>
          )}
        </div>

        {/* Category split */}
        <div className="mt-4 rounded-3xl bg-card/70 p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Category limits</div>
            <div className="text-[11px] text-muted-foreground">
              ${total} <span className={total > amount ? "text-destructive" : ""}>/ ${amount}</span>
            </div>
          </div>
          <div className="mt-3 space-y-4">
            {CATEGORIES.map((c) => (
              <div key={c.key}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-base">{c.emoji}</span>
                    <span>{c.label}</span>
                  </div>
                  <span className="text-xs font-medium">${cats[c.key] ?? 0}</span>
                </div>
                <Slider
                  className="mt-2"
                  value={[cats[c.key] ?? 0]}
                  min={0}
                  max={Math.max(amount, 500)}
                  step={10}
                  onValueChange={(v) => setCats((s) => ({ ...s, [c.key]: v[0] }))}
                />
              </div>
            ))}
          </div>
          {total > amount && (
            <div className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              Category total exceeds your {period.toLowerCase()} cap by ${total - amount}.
            </div>
          )}
        </div>

        {/* Alert threshold */}
        <div className="mt-4 rounded-3xl bg-card/70 p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Alert me at</div>
            <span className="text-xs font-medium">{alertAt}%</span>
          </div>
          <Slider
            className="mt-3"
            value={[alertAt]}
            min={50}
            max={100}
            step={5}
            onValueChange={(v) => setAlertAt(v[0])}
          />
          <p className="mt-2 text-[11px] text-muted-foreground">
            Simone will ping you when spending reaches this share of your budget.
          </p>
        </div>

        <Button onClick={save} className="mt-5 h-12 w-full rounded-full text-sm">
          {saved ? (<><Check className="h-4 w-4" /> Saved</>) : "Save budget"}
        </Button>
      </div>
    </MobileFrame>
  );
}
