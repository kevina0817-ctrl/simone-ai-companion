import type { HomeSectionCollapse } from "@/hooks/useHomeSectionCollapse";

type Props = {
  sections: HomeSectionCollapse;
  className?: string;
};

export function HomeSectionControls({ sections, className }: Props) {
  return (
    <div className={className ?? "mt-5 flex items-center justify-end gap-4"}>
      <button
        type="button"
        onClick={() => sections.expandAll()}
        className="text-xs font-medium text-primary hover:text-primary/80"
      >
        Expand all
      </button>
      <button
        type="button"
        onClick={() => sections.collapseAll()}
        className="text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        Collapse all
      </button>
    </div>
  );
}
