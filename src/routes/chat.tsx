import { createFileRoute } from "@tanstack/react-router";
import { Calendar, DollarSign, History, Menu, Mic, Moon, Package, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MobileFrame } from "@/components/MobileFrame";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { sendChatMessage } from "@/lib/chat.functions";
import { toast } from "sonner";
import { addDemoMessage, backendAvailable, cancelDemoEvent, getDemoMessages, scheduleDemoEvent } from "@/lib/demo-mode";

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
  const qc = useQueryClient();
  const send = useServerFn(sendChatMessage);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
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

  const submit = async (msg?: string) => {
    const t = (msg ?? text).trim();
    if (!t || pending) return;
    setText("");
    setPending(true);
    try {
      if (!backendAvailable) {
        addDemoMessage({ role: "user", content: t });
        const lower = t.toLowerCase();
        if (/cancel|remove|delete|drop|skip/.test(lower)) {
          const cancelled = cancelDemoEvent(t);
          addDemoMessage({ role: "assistant", content: cancelled ? `Done — removed ${cancelled.title} from your schedule.` : "Which meeting should I remove?" });
          await qc.invalidateQueries({ queryKey: ["events", user!.id] });
        } else if (/schedule|book|add/.test(lower)) {
          const start = new Date();
          start.setHours(17, 30, 0, 0);
          const event = scheduleDemoEvent("Recovery session", start.toISOString());
          addDemoMessage({ role: "assistant", content: `Done — added ${event.title} at 5:30 PM.` });
          await qc.invalidateQueries({ queryKey: ["events", user!.id] });
        } else {
          addDemoMessage({ role: "assistant", content: "Your day looks balanced. I can add or remove meetings from today’s schedule if you ask." });
        }
        await qc.invalidateQueries({ queryKey: ["chat", user!.id] });
        return;
      }
      qc.setQueryData(["chat", user!.id], (old: typeof messages | undefined) => [
        ...(old ?? []),
        { id: `tmp-${Date.now()}`, role: "user", content: t, created_at: new Date().toISOString() },
      ]);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const result = await send({ data: { message: t, timezone: tz, nowIso: new Date().toISOString() } });
      await qc.invalidateQueries({ queryKey: ["chat", user!.id] });
      if (result?.actions?.some((a) => a.kind === "schedule_event" || a.kind === "cancel_event")) {
        await qc.invalidateQueries({ queryKey: ["events", user!.id] });
        if (result.actions.some((a) => a.kind === "cancel_event")) {
          toast.success("Removed from your schedule");
        } else {
          toast.success("Added to today's schedule");
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Simone couldn't respond");
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
            <div className="font-display text-lg">Simone</div>
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> Online
            </div>
          </div>
          <button className="rounded-full bg-card/70 p-2"><History className="h-4 w-4" /></button>
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

        <div className="flex items-center gap-2 rounded-full bg-card/70 px-2 py-2 shadow-card">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Message your AI concierge…"
            className="flex-1 bg-transparent px-3 text-sm placeholder:text-muted-foreground focus:outline-none"
            disabled={pending}
          />
          <button className="p-2 text-muted-foreground"><Mic className="h-4 w-4" /></button>
          <button
            onClick={() => submit()}
            disabled={pending}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </MobileFrame>
  );
}
