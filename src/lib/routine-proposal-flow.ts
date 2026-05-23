import type { ChatScheduleAction } from "@/lib/chat-actions";
import { buildDeterministicRoutineReply } from "@/lib/proposed-routine";
import type { ScheduleItem } from "@/lib/schedule-item";
import {
  buildRoutineProposalChatMessage,
  createRoutineProposal,
  type RoutineProposal,
} from "@/lib/routine-proposal";
import {
  buildScheduleActionsFromActivityNames,
  resolveChatScheduleFromRoutineProposal,
  type ResolveChatScheduleResult,
} from "@/lib/resolve-chat-schedule";

export function buildTiredEveningRoutineProposal(): RoutineProposal {
  return createRoutineProposal([
    "Rest and Relax",
    "Light Stretching or Breathing",
    "Early Bedtime Preparation",
  ]);
}

export function buildTiredEveningProposalReply(proposal?: RoutineProposal): string {
  return buildRoutineProposalChatMessage(proposal ?? buildTiredEveningRoutineProposal());
}

export function resolveTiredEveningRoutineSchedule(
  activities: string[],
  opts: {
    userMessage?: string;
    nowIso?: string;
    todayEvents?: ScheduleItem[];
  },
): ResolveChatScheduleResult {
  return resolveChatScheduleFromRoutineProposal(activities, opts);
}

export function scheduleActionsFromResolved(
  resolved: ResolveChatScheduleResult,
): Extract<ChatScheduleAction, { kind: "schedule_event" }>[] {
  if (resolved.events.length === 0) return [];
  return resolved.events.map((item) => ({
    kind: "schedule_event" as const,
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    start_time: item.start_time,
    end_time: item.end_time,
    level: item.level,
  }));
}

export function buildTiredEveningScheduledReply(
  resolved: ResolveChatScheduleResult,
): string {
  if (!resolved.proposedRoutine) {
    return "I've prepared your wind-down routine for tonight — review the times under Approvals.";
  }
  return buildDeterministicRoutineReply(resolved.proposedRoutine, null);
}

export function buildPhase2RoutineFromProposal(
  proposal: RoutineProposal,
  opts: {
    userMessage?: string;
    nowIso?: string;
    todayEvents?: ScheduleItem[];
  },
): { resolved: ResolveChatScheduleResult; actions: Extract<ChatScheduleAction, { kind: "schedule_event" }>[]; reply: string } {
  const resolved = resolveTiredEveningRoutineSchedule(proposal.activities, opts);
  return {
    resolved,
    actions: scheduleActionsFromResolved(resolved),
    reply: buildTiredEveningScheduledReply(resolved),
  };
}

/** Placeholder actions for pipeline-only resolution (should not be used for display). */
export function placeholderActionsForActivities(activities: string[]): Extract<ChatScheduleAction, { kind: "schedule_event" }>[] {
  return buildScheduleActionsFromActivityNames(activities);
}
