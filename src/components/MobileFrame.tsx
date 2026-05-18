import { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

export function StatusBar() {
  return (
    <div className="flex items-center justify-between px-6 pt-4 pb-2 text-xs font-medium text-foreground/90">
      <span>9:41</span>
      <div className="flex items-center gap-1.5 opacity-80">
        <span className="text-[10px]">●●●●</span>
        <span className="text-[10px]">▲</span>
        <span className="inline-block h-2.5 w-5 rounded-sm border border-foreground/60" />
      </div>
    </div>
  );
}

export function MobileFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-background bg-aurora">
      <div className="mx-auto flex min-h-screen max-w-[440px] flex-col">
        <StatusBar />
        <main className="flex-1 pb-28">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
