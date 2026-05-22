import type { PendingOrder } from "@/lib/pending-order";

export type ScheduleEventAction = {
  kind: "schedule_event";
  id?: string;
  title: string;
  subtitle?: string | null;
  start_time: string;
  end_time?: string;
  level?: "High" | "Medium" | "Low";
};

export type CancelEventAction = {
  kind: "cancel_event";
  id?: string;
  event_id?: string;
  title?: string;
  start_time?: string;
};

export type CreatePendingOrderAction = {
  kind: "create_pending_order";
  orderId: string;
  title: string;
};

export type OrderPayloadAction = {
  kind: "create_pending_order";
  order: PendingOrder;
};

export type ChatScheduleAction = ScheduleEventAction | CancelEventAction;

export type ChatAction = ChatScheduleAction | CreatePendingOrderAction | OrderPayloadAction;

export type ChatResponse = {
  reply: string;
  actions: ChatAction[];
  pendingOrders: PendingOrder[];
};

export function isScheduleAction(action: ChatAction): action is ChatScheduleAction {
  return action.kind === "schedule_event" || action.kind === "cancel_event";
}

export function toScheduleActions(actions: ChatAction[] | undefined): ChatScheduleAction[] {
  return (actions ?? []).filter(isScheduleAction);
}
