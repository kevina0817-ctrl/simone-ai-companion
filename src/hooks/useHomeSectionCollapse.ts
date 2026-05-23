import { useCallback, useEffect, useState } from "react";

export type HomeSectionId =
  | "insight"
  | "recovery"
  | "mealsHabits"
  | "recommendations"
  | "notifications"
  | "thisWeek";

export const HOME_SECTION_IDS: HomeSectionId[] = [
  "insight",
  "recovery",
  "mealsHabits",
  "recommendations",
  "notifications",
  "thisWeek",
];

const STORAGE_KEY = "simone:home-sections";

const DEFAULT_OPEN: Record<HomeSectionId, boolean> = {
  insight: true,
  recovery: true,
  mealsHabits: true,
  recommendations: true,
  notifications: true,
  thisWeek: true,
};

function loadSectionState(): Record<HomeSectionId, boolean> {
  if (typeof window === "undefined") return { ...DEFAULT_OPEN };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_OPEN };
    const parsed = JSON.parse(raw) as Partial<Record<HomeSectionId, boolean>>;
    return { ...DEFAULT_OPEN, ...parsed };
  } catch {
    return { ...DEFAULT_OPEN };
  }
}

/** Expanded/collapsed state for Home sections — persists for the browser session. */
export function useHomeSectionCollapse() {
  const [open, setOpen] = useState(loadSectionState);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(open));
  }, [open]);

  const isOpen = useCallback((id: HomeSectionId) => open[id], [open]);

  const setSectionOpen = useCallback((id: HomeSectionId, next: boolean) => {
    setOpen((prev) => ({ ...prev, [id]: next }));
  }, []);

  const toggle = useCallback((id: HomeSectionId) => {
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const expandAll = useCallback((ids: HomeSectionId[] = HOME_SECTION_IDS) => {
    setOpen((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = true;
      return next;
    });
  }, []);

  const collapseAll = useCallback((ids: HomeSectionId[] = HOME_SECTION_IDS) => {
    setOpen((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = false;
      return next;
    });
  }, []);

  return { isOpen, setSectionOpen, toggle, expandAll, collapseAll };
}

export type HomeSectionCollapse = ReturnType<typeof useHomeSectionCollapse>;
