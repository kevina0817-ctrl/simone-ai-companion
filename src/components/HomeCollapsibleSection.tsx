import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HomeSectionCollapse, HomeSectionId } from "@/hooks/useHomeSectionCollapse";

type Props = {
  sectionId: HomeSectionId;
  sections: HomeSectionCollapse;
  title: string;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function HomeCollapsibleSection({
  sectionId,
  sections,
  title,
  icon,
  className,
  children,
}: Props) {
  const expanded = sections.isOpen(sectionId);

  return (
    <div className={cn("rounded-3xl bg-card/70 shadow-card", className)}>
      <button
        type="button"
        onClick={() => sections.toggle(sectionId)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 p-5 text-left"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
          {icon}
          <span>{title}</span>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {expanded && <div className="px-5 pb-5 pt-0">{children}</div>}
    </div>
  );
}
