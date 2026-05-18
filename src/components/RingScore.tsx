export function RingScore({
  value,
  label,
  status,
  detail,
  color = "primary",
}: {
  value: number;
  label: string;
  status: string;
  detail: string;
  color?: "primary" | "champagne";
}) {
  const stroke = color === "champagne" ? "var(--champagne)" : "var(--primary)";
  const circumference = 2 * Math.PI * 42;
  const dash = (value / 100) * circumference;
  return (
    <div className="flex flex-col items-center rounded-3xl bg-card/70 p-4 shadow-card">
      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>{label}</span>
      </div>
      <div className="relative">
        <svg width="110" height="110" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" stroke="oklch(0.3 0.025 280)" strokeWidth="6" fill="none" />
          <circle
            cx="50"
            cy="50"
            r="42"
            stroke={stroke}
            strokeWidth="6"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${dash} ${circumference}`}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl font-light tracking-tight">{value}</span>
          <span className="text-[10px] text-muted-foreground">/100</span>
        </div>
      </div>
      <div className="mt-2 text-center">
        <div className="text-sm font-medium">{status}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}
