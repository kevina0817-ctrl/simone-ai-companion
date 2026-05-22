import { useState } from "react";
import { Package, Truck } from "lucide-react";
import { toast } from "sonner";
import type { PendingOrder } from "@/lib/pending-order";
import { cancelApprovedOrder } from "@/lib/pending-orders-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

export function PendingOrderCard({
  order,
  compact,
  showApprovedActions,
}: {
  order: PendingOrder;
  compact?: boolean;
  /** Track / Cancel actions for approved orders on the Orders page */
  showApprovedActions?: boolean;
}) {
  const [trackingOpen, setTrackingOpen] = useState(false);
  const itemCount = order.items.reduce((s, i) => s + i.qty, 0);
  const priceSymbol = order.amountCurrency === "CAD" ? "CA$" : "$";

  const onCancel = () => {
    const removed = cancelApprovedOrder(order.id);
    if (!removed) {
      toast.error("Could not cancel this order");
      return;
    }
    toast.success(
      `Canceled “${removed.title}” — ${priceSymbol}${removed.totalEstimatedPrice.toFixed(2)} removed from this month's spend`,
    );
  };

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
            <span className="tabular-nums">
              {priceSymbol}
              {(it.estimatedPrice * it.qty).toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
      <div className={`flex items-baseline justify-between ${compact ? "mt-2 border-t border-border/60 pt-2" : "mt-2 border-t border-border/60 pt-2"}`}>
        <span className="text-muted-foreground text-[11px]">Est. total</span>
        <span className="tabular-nums text-sm font-medium">
          {priceSymbol}
          {order.totalEstimatedPrice.toFixed(2)}
        </span>
      </div>

      {showApprovedActions && order.status === "approved" && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setTrackingOpen(true)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-secondary/50 py-2.5 text-xs font-medium"
          >
            <Truck className="h-3.5 w-3.5" />
            Track Order
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-risk-high/30 bg-risk-high/10 py-2.5 text-xs font-medium text-risk-high"
          >
            Cancel Order
          </button>
        </div>
      )}

      <Dialog open={trackingOpen} onOpenChange={setTrackingOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Order tracking</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{order.title}</p>
          <div className="mt-3 space-y-3 rounded-2xl border border-border/60 bg-background/40 p-4 text-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/15">
                <Package className="h-4 w-4 text-success" />
              </div>
              <div>
                <div className="font-medium">Confirmed</div>
                <div className="text-[11px] text-muted-foreground">{order.store}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 opacity-80">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-champagne/15">
                <Truck className="h-4 w-4 text-champagne" />
              </div>
              <div>
                <div className="font-medium">In transit</div>
                <div className="text-[11px] text-muted-foreground">Estimated delivery in 3–5 business days</div>
              </div>
            </div>
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            Live carrier tracking will be available in a future update.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
