import type { PendingOrder } from "@/lib/pending-order";

const statusLabel: Record<PendingOrder["status"], string> = {
  pending_approval: "Pending approval",
  approved: "Approved",
  declined: "Declined",
};

const statusClass: Record<PendingOrder["status"], string> = {
  pending_approval: "bg-champagne/15 text-champagne",
  approved: "bg-success/15 text-success",
  declined: "bg-risk-high/15 text-risk-high",
};

export function PendingOrderCard({ order, compact }: { order: PendingOrder; compact?: boolean }) {
  const itemCount = order.items.reduce((s, i) => s + i.qty, 0);

  return (
    <div className={compact ? "rounded-2xl border border-border/60 bg-background/40 p-3" : "mt-4 rounded-3xl bg-card/70 p-5 shadow-card"}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium">{order.title}</div>
          <div className="text-[11px] text-muted-foreground">
            {order.store} • {itemCount} items
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${statusClass[order.status]}`}>
          {statusLabel[order.status]}
        </span>
      </div>

      <ul className={`divide-y divide-border/50 font-mono text-[11px] ${compact ? "mt-2" : "mt-3 rounded-2xl border border-border/60 bg-background/40 p-3"}`}>
        {order.items.map((it, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3 py-1.5">
            <span className="flex-1 truncate">
              {it.qty > 1 ? <span className="text-muted-foreground">{it.qty}× </span> : null}
              {it.name}
            </span>
            <span className="tabular-nums">${(it.estimatedPrice * it.qty).toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <div className={`flex items-baseline justify-between ${compact ? "mt-2 border-t border-border/60 pt-2" : "mt-2 border-t border-border/60 pt-2"}`}>
        <span className="text-muted-foreground text-[11px]">Est. total</span>
        <span className="tabular-nums text-sm font-medium">${order.totalEstimatedPrice.toFixed(2)}</span>
      </div>
    </div>
  );
}
