import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { backendAvailable, cancelDemoEvent, getDemoEvents, addScheduleItem } from "@/lib/demo-mode";
import { parseScheduleFromText, type ScheduleItem } from "@/lib/schedule-item";

export type ChatScheduleAction =
  | {
      kind: "schedule_event";
      id?: string;
      title: string;
      subtitle?: string | null;
      start_time: string;
      level?: "High" | "Medium" | "Low";
    }
  | {
      kind: "cancel_event";
      id?: string;
      title?: string;
      start_time?: string;
    };

type ApplyInput = {
  actions?: ChatScheduleAction[];
  userMessage: string;
  assistantReply?: string;
  userId: string;
};

function toScheduleItem(action: Extract<ChatScheduleAction, { kind: "schedule_event" }>): ScheduleItem {
  return {
    id: action.id ?? `schedule-${Date.now()}`,
    title: action.title,
    subtitle: action.subtitle ?? null,
    start_time: new Date(action.start_time).toISOString(),
    level: action.level ?? "Medium",
  };
}

async function insertScheduleClient(item: ScheduleItem, userId: string) {
  const { error } = await supabase.from("schedule_events").insert({
    user_id: userId,
    title: item.title,
    subtitle: item.subtitle,
    start_time: item.start_time,
    level: item.level,
  });
  if (error) throw error;
}

/**
 * Applies schedule/cancel actions from chat to the same store the Homepage reads.
 */
export async function applyChatScheduleResult(
  qc: QueryClient,
  { actions = [], userMessage, assistantReply, userId }: ApplyInput,
): Promise<{ scheduled: ScheduleItem[]; cancelled: boolean }> {
  const scheduled: ScheduleItem[] = [];
  let cancelled = false;
  const today = new Date().toISOString().slice(0, 10);

  for (const action of actions) {
    if (action.kind === "schedule_event") {
      const item = toScheduleItem(action);
      if (backendAvailable) {
        if (!action.id) await insertScheduleClient(item, userId);
      } else {
        addScheduleItem(item);
      }
      scheduled.push(item);
    } else if (action.kind === "cancel_event") {
      if (backendAvailable) {
        if (action.id) {
          await supabase.from("schedule_events").delete().eq("id", action.id).eq("user_id", userId);
          cancelled = true;
        }
      } else {
        const hint = action.title ?? userMessage;
        if (cancelDemoEvent(hint)) cancelled = true;
      }
    }
  }

  if (scheduled.length === 0) {
    const fallbackText = `${userMessage}\n${assistantReply ?? ""}`;
    const parsed = parseScheduleFromText(fallbackText);
    if (parsed) {
      if (backendAvailable) {
        await insertScheduleClient(parsed, userId);
      } else {
        addScheduleItem(parsed);
      }
      scheduled.push(parsed);
    }
  }

  await qc.invalidateQueries({ queryKey: ["events", userId] });
  await qc.invalidateQueries({ queryKey: ["events", userId, today] });

  if (!backendAvailable) {
    void getDemoEvents();
  }

  return { scheduled, cancelled };
}
