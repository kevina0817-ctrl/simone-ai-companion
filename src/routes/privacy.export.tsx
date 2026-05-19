import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Calendar, Download, Heart, MessageCircle, ShieldCheck, ShoppingCart, X } from "lucide-react";
import { useState } from "react";
import { MobileFrame } from "@/components/MobileFrame";
import { RequireAuth } from "@/components/RequireAuth";

export const Route = createFileRoute("/privacy/export")({
  head: () => ({ meta: [{ title: "Export your data — Simone" }] }),
  component: () => <RequireAuth><ExportPage /></RequireAuth>,
});

const datasets = [
  { id: "chat", Icon: MessageCircle, title: "Chat memory", size: "1.2 MB" },
  { id: "cal", Icon: Calendar, title: "Calendar events", size: "340 KB" },
  { id: "shop", Icon: ShoppingCart, title: "Orders & receipts", size: "2.8 MB" },
  { id: "health", Icon: Heart, title: "Health insights", size: "510 KB" },
];

function ExportPage() {
  const [selected, setSelected] = useState<Record<string, boolean>>({ chat: true, cal: true, shop: true, health: false });
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [status, setStatus] = useState<"idle" | "preparing" | "ready">("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const start = () => {
    setConfirmOpen(false);
    setConfirmText("");
    setStatus("preparing");
    setTimeout(() => setStatus("ready"), 1500);
  };

  const download = () => {
    const picked = datasets.filter((d) => selected[d.id]);
    const stamp = new Date().toISOString().slice(0, 10);
    let blob: Blob;
    let filename: string;

    if (format === "json") {
      const payload = {
        exportedAt: new Date().toISOString(),
        datasets: picked.map((d) => ({
          id: d.id,
          title: d.title,
          size: d.size,
          records: [
            { id: `${d.id}-1`, summary: `Sample ${d.title} entry`, createdAt: "2026-05-10T09:14:00Z" },
            { id: `${d.id}-2`, summary: `Sample ${d.title} entry`, createdAt: "2026-05-12T17:42:00Z" },
          ],
        })),
      };
      blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      filename = `simone-export-${stamp}.json`;
    } else {
      const rows = [
        ["dataset", "record_id", "summary", "created_at"],
        ...picked.flatMap((d) => [
          [d.id, `${d.id}-1`, `Sample ${d.title} entry`, "2026-05-10T09:14:00Z"],
          [d.id, `${d.id}-2`, `Sample ${d.title} entry`, "2026-05-12T17:42:00Z"],
        ]),
      ];
      blob = new Blob([rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n")], { type: "text/csv" });
      filename = `simone-export-${stamp}.csv`;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <MobileFrame>
      <div className="px-5">
        <header className="flex items-center justify-between pb-3">
          <Link to="/privacy" className="rounded-full bg-card/70 p-2">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="font-display text-xl">Export your data</h1>
          <div className="w-8" />
        </header>

        <p className="text-sm leading-relaxed text-muted-foreground">
          Choose which data to include. We'll bundle a download and email you the link.
        </p>

        <section className="mt-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Include</h2>
          <div className="rounded-3xl bg-card/70 shadow-card">
            {datasets.map((d, i) => (
              <label
                key={d.id}
                className={`flex items-center gap-3 px-4 py-4 ${
                  i < datasets.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
                  <d.Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{d.title}</div>
                  <div className="text-[11px] text-muted-foreground">{d.size}</div>
                </div>
                <input
                  type="checkbox"
                  checked={!!selected[d.id]}
                  onChange={(e) => setSelected((s) => ({ ...s, [d.id]: e.target.checked }))}
                  className="h-4 w-4 accent-primary"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="mt-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Format</h2>
          <div className="flex gap-1 rounded-full bg-card/60 p-1">
            {(["json", "csv"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium uppercase transition-colors ${
                  format === f ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </section>

        {status === "ready" ? (
          <button
            onClick={download}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-success py-3 text-sm font-semibold text-primary-foreground shadow-glow"
          >
            <Download className="h-4 w-4" /> Download archive
          </button>
        ) : (
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={status === "preparing" || Object.values(selected).every((v) => !v)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {status === "preparing" ? "Preparing…" : "Request export"}
          </button>
        )}

        <p className="mt-3 text-[11px] text-muted-foreground">
          Exports are encrypted and available for 7 days.
        </p>
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 px-4 pb-6 pt-10 backdrop-blur-sm sm:items-center"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 shadow-card"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="text-base font-medium">Confirm data export</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  We'll bundle {Object.values(selected).filter(Boolean).length} dataset(s) as{" "}
                  <span className="font-mono uppercase">{format}</span>. Type{" "}
                  <span className="font-mono text-foreground">CONFIRM</span> to continue.
                </p>
              </div>
              <button onClick={() => setConfirmOpen(false)} className="rounded-full p-1 text-muted-foreground hover:bg-secondary/60">
                <X className="h-4 w-4" />
              </button>
            </div>

            <input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="CONFIRM"
              className="mt-4 w-full rounded-2xl border border-border bg-secondary/40 px-4 py-3 text-sm outline-none focus:border-primary"
            />

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 rounded-full border border-border bg-secondary/50 py-2.5 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={start}
                disabled={confirmText.trim().toUpperCase() !== "CONFIRM"}
                className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-40"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </MobileFrame>
  );
}
