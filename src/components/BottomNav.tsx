import { Link, useLocation } from "@tanstack/react-router";
import { Home, MessageCircle, Package, ShieldCheck, Settings } from "lucide-react";

const items = [
  { to: "/", label: "Home", Icon: Home },
  { to: "/chat", label: "Chat", Icon: MessageCircle },
  { to: "/orders", label: "Orders", Icon: Package },
  { to: "/approvals", label: "Approvals", Icon: ShieldCheck },
  { to: "/privacy", label: "Settings", Icon: Settings },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-[440px] -translate-x-1/2 px-4 pb-4">
      <div className="glass flex items-center justify-around rounded-3xl border border-border px-2 py-3 shadow-card">
        {items.map(({ to, label, Icon }) => {
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center gap-1 px-3 py-1 text-[10px] font-medium"
            >
              <Icon
                className={`h-5 w-5 transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
                strokeWidth={active ? 2.4 : 1.8}
              />
              <span className={active ? "text-foreground" : "text-muted-foreground"}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
