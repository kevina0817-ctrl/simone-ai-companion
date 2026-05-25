import { createFileRoute } from "@tanstack/react-router";
import { Calendar, DollarSign, Menu, Mic, Moon, Package, Send, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChatMessageInput } from "@/components/ChatMessageInput";
import { MobileFrame } from "@/components/MobileFrame";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/hooks/useAuth";
import { useResolvedDisplayName } from "@/hooks/useResolvedDisplayName";
import { supabase } from "@/integrations/supabase/client";
import { clearChatHistory, sendChatMessage } from "@/lib/chat.functions";
import { clearChatDraft, readChatDraft, writeChatDraft } from "@/lib/chat-draft";
import { isClearChatCommand } from "@/lib/chat-clear";
import { sendDemoChatMessage } from "@/lib/demo-chat.functions";
import { toast } from "sonner";
import { toScheduleActions } from "@/lib/chat-actions";
import { applyChatScheduleResult } from "@/lib/apply-chat-schedule";
import { applyScheduleReplyOutcome } from "@/lib/chat-schedule-reply";
import {
  enforceRoutineTimesInReply,
  verifyProposedRoutineChatAlignment,
} from "@/lib/proposed-routine";
import { applyChatOrderResult } from "@/lib/apply-chat-orders";
import { filterEventsForToday, getLocalCalendarDayBounds } from "@/lib/schedule-context";
import {
  addDemoMessage,
  backendAvailable,
  clearDemoMessages,
  getDemoEvents,
  getDemoMessages,
  resolveHomeWellness,
} from "@/lib/demo-mode";

export const Route = createFileRoute("/chat")({
  head: () => ({ meta: [{ title: "Concierge — Simone" }] }),
  component: () => <RequireAuth><ChatPage /></RequireAuth>,
});

const quick = [
  { label: "How's my day?", Icon: Calendar },
  { label: "Any orders pending?", Icon: Package },
  { label: "Stay on budget?", Icon: DollarSign },
  { label: "Help me wind down", Icon: Moon },
];

function ChatPage() {
  const { user } = useAuth();
  const displayName = useResolvedDisplayName();
  const qc = useQueryClient();
  const send = useServerFn(sendChatMessage);
  const sendDemo = useServerFn(sendDemoChatMessage);
  const clearChat = useServerFn(clearChatHistory);
  const userId = user!.id;
  const [text, setText] = useState(() => readChatDraft(userId));
  const [pending, setPending] = useState(false);

  const setDraft = (value: string) => {
    setText(value);
    writeChatDraft(userId, value);
  };
  const [clearing, setClearing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["chat", user!.id],
    queryFn: async () => {
      if (!backendAvailable) return getDemoMessages();
      const { data } = await supabase
        .from("chat_messages")
        .select("id,role,content,created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true })
        .limit(50);
      return data ?? [];
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending]);

  const clearConversation = async () => {
    if (pending || clearing) return;
    setClearing(true);
    try {
      if (backendAvailable) {
        await clearChat();
      } else {
        clearDemoMessages();
      }
      qc.setQueryData(["chat", user!.id], []);
      void qc.invalidateQueries({ queryKey: ["chat", user!.id] });
      toast.success("Chat cleared");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not clear chat");
    } finally {
      setClearing(false);
    }
  };

  const submit = async (msg?: string) => {
    const t = (msg ?? text).trim();
    if (!t || pending || clearing) return;

    if (isClearChatCommand(t)) {
      setDraft("");
      await clearConversation();
      return;
    }

    setDraft("");
    setPending(true);

    // ADDED: Immediately show user's message in UI.
    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: t,
      created_at: new Date().toISOString(),
    };

    qc.setQueryData(["chat", user!.id], (old: typeof messages | undefined) => [
      ...(old ?? []),
      userMessage,
    ]);
    
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const nowIso = new Date().toISOString();
      const { startIso: dayStartIso, endIso: dayEndIso } = getLocalCalendarDayBounds();

      const result = backendAvailable
        ? await send({ data: { message: t, timezone, nowIso, dayStartIso, dayEndIso } })
        : await sendDemo({
            data: {
              message: t,
              timezone,
              nowIso,
              history: getDemoMessages().map((m) => ({ role: m.role, content: m.content })),
              events: filterEventsForToday(getDemoEvents()),
              wellness: resolveHomeWellness(user?.email, null),
            },
          });

      if (!backendAvailable) {
        addDemoMessage({ role: "user", content: t });
      }

      const replyText = result.reply;

      const {
        committed,
        pendingApproval,
        cancelled,
        removedFood,
        foodBedtime,
        proposedRoutine,
        routineProposal,
        displayReplyOverride,
      } = await applyChatScheduleResult(qc, {
        actions: toScheduleActions(result.actions),
        userMessage: t,
        assistantReply: replyText,
        userId: user!.id,
        nowIso,
        routineProposal: result.routineProposal,
        routineScheduleConfirmed: result.routineScheduleConfirmed,
      });

      let displayReply =
        displayReplyOverride ??
        applyScheduleReplyOutcome(replyText, {
          committed,
          pendingApproval,
          removedFood,
          foodBedtime,
          userMessage: t,
          proposedRoutine,
        });

      if (proposedRoutine && !routineProposal && proposedRoutine.activities.length > 0) {
        displayReply = enforceRoutineTimesInReply(displayReply, proposedRoutine);
        verifyProposedRoutineChatAlignment(displayReply, proposedRoutine);
      }

      if (routineProposal) {
        toast.success("Wind-down routine ready — reply in chat or approve on Approvals to schedule times");
      }

      if (committed.length > 0) {
        toast.success(
          committed.length === 1
            ? `Added “${committed[0].title}” to today's schedule`
            : `Added ${committed.length} events to today's schedule`,
        );
      }

      if (pendingApproval.length > 0) {
        toast.success(
          pendingApproval.length === 1
            ? `“${pendingApproval[0].title}” sent for approval — review on Approvals`
            : `${pendingApproval.length} events sent for approval`,
        );
      }

      if (cancelled.length > 0) {
        toast.success(
          cancelled.length === 1
            ? `Removed “${cancelled[0].title}” from today's schedule`
            : `Removed ${cancelled.length} events from today's schedule`,
        );
      }

      const orders = applyChatOrderResult({
        pendingOrders: result.pendingOrders,
        actions: result.actions,
        userMessage: t,
        assistantReply: replyText,
      });

      if (orders.length > 0) {
        toast.success(
          orders.length === 1
            ? `Order “${orders[0].title}” sent for approval — budget checked when you approve`
            : `${orders.length} orders sent for approval — budget checked when you approve`,
        );
      }

      const aiMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: displayReply,
        created_at: new Date().toISOString(),
      };

      if (!backendAvailable) {
        addDemoMessage({ role: "assistant", content: displayReply });
      }

      qc.setQueryData(["chat", user!.id], (old: typeof messages | undefined) => [
        ...(old ?? []),
        aiMessage,
      ]);
      // Do not refetch chat history here — the server may have stored pre-merge copy on older builds,
      // and refetch would replace canonical routine times shown in Approvals.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Simone couldn't connect to backend");
    } finally {
      setPending(false);
    }
  };
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <MobileFrame>
      <div className="flex h-[calc(100vh-7rem)] flex-col px-5">
        <header className="flex items-center justify-between pb-3">
          <button className="rounded-full bg-card/70 p-2"><Menu className="h-4 w-4" /></button>
          <div className="text-center">
            <div className="font-display text-lg">Simone for {displayName}</div>
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> Online
            </div>
          </div>
          <button
            type="button"
            onClick={() => void clearConversation()}
            disabled={pending || clearing || messages.length === 0}
            title="Clear all messages"
            className="inline-flex items-center gap-1 rounded-full bg-card/70 px-2.5 py-1.5 text-[11px] text-muted-foreground disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear all
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto py-2">
          {messages.length === 0 && (
            <div className="mx-auto max-w-[280px] py-10 text-center text-sm text-muted-foreground">
              <Sparkles className="mx-auto mb-3 h-6 w-6 text-primary" />
              Hi, I'm Simone. Ask me anything about your day, your wellness, or your orders.
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex items-end gap-2 ${m.role === "user" ? "justify-end" : ""}`}>
              {m.role !== "user" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-card ${
                  m.role === "user"
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md bg-card/80"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                <div className={`mt-1 text-[10px] ${m.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {fmtTime(m.created_at)}
                </div>
              </div>
            </div>
          ))}
          {pending && (
            <div className="flex items-end gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <Sparkles className="h-4 w-4 animate-pulse text-primary" />
              </div>
              <div className="rounded-2xl rounded-bl-md bg-card/80 px-4 py-2.5 text-sm text-muted-foreground shadow-card">
                Simone is thinking…
              </div>
            </div>
          )}
        </div>

        {messages.length === 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
            {quick.map(({ label, Icon }) => (
              <button
                key={label}
                onClick={() => submit(label)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs text-muted-foreground"
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-1 rounded-2xl bg-card/70 px-2 py-2 shadow-card sm:gap-2">
          <ChatMessageInput
            value={text}
            onChange={setDraft}
            onSubmit={() => submit()}
            disabled={pending || clearing}
            className="flex-1"
          />
          <button type="button" className="mb-0.5 shrink-0 p-2 text-muted-foreground" aria-label="Voice input">
            <Mic className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => submit()}
            disabled={pending || clearing}
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow disabled:opacity-50"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </MobileFrame>
  );
}
