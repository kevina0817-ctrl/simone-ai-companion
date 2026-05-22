import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  removeTimelineEventById,
  todayQueryKey,
  updateTimelineEvent,
  type TimelineEventRow,
} from "@/lib/schedule-timeline-cache";
import type { ScheduleLevel } from "@/lib/schedule-item";
import { getSchedulePriorityStyles } from "@/lib/schedule-priority";

type Props = {
  event: TimelineEventRow;
  userId: string;
};

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleEventActions({ event, userId }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [subtitle, setSubtitle] = useState(event.subtitle ?? "");
  const [startLocal, setStartLocal] = useState(toDatetimeLocalValue(event.start_time));
  const [level, setLevel] = useState<ScheduleLevel>(
    (event.level as ScheduleLevel) || "Medium",
  );

  const openEdit = () => {
    setTitle(event.title);
    setSubtitle(event.subtitle ?? "");
    setStartLocal(toDatetimeLocalValue(event.start_time));
    setLevel((event.level as ScheduleLevel) || "Medium");
    setEditing(true);
  };

  const cancelM = useMutation({
    mutationFn: () => removeTimelineEventById(qc, userId, event.id),
    onSuccess: () => {
      toast.success(`Removed “${event.title}”`);
      void qc.invalidateQueries({ queryKey: todayQueryKey(userId) });
    },
    onError: () => toast.error("Could not remove event"),
  });

  const saveM = useMutation({
    mutationFn: async () => {
      const start_time = new Date(startLocal).toISOString();
      return updateTimelineEvent(qc, userId, {
        ...event,
        title: title.trim(),
        subtitle: subtitle.trim() || null,
        start_time,
        level,
      });
    },
    onSuccess: () => {
      toast.success("Event updated");
      setEditing(false);
      void qc.invalidateQueries({ queryKey: todayQueryKey(userId) });
    },
    onError: () => toast.error("Could not update event"),
  });

  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={openEdit}
          className="text-[10px] font-medium text-primary hover:underline"
        >
          Modify
        </button>
        <button
          type="button"
          onClick={() => cancelM.mutate()}
          disabled={cancelM.isPending}
          className="text-[10px] font-medium text-muted-foreground hover:text-risk-high disabled:opacity-50"
        >
          {cancelM.isPending ? "…" : "Cancel"}
        </button>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-[calc(100%-2rem)] rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Modify event</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-border bg-background/60 px-3 py-2"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">Details</span>
              <input
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                className="w-full rounded-xl border border-border bg-background/60 px-3 py-2"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">Time</span>
              <input
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                className="w-full rounded-xl border border-border bg-background/60 px-3 py-2"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">Priority</span>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as ScheduleLevel)}
                className="w-full rounded-xl border border-border bg-background/60 px-3 py-2"
              >
                {(["High", "Medium", "Low"] as const).map((opt) => {
                  const styles = getSchedulePriorityStyles(opt);
                  return (
                    <option key={opt} value={opt}>
                      {styles.label} — {opt}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 rounded-full border border-border py-2 text-sm"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => saveM.mutate()}
              disabled={saveM.isPending || !title.trim()}
              className="flex-1 rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {saveM.isPending ? "Saving…" : "Save"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
