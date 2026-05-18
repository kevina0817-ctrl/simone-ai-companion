import { createFileRoute } from "@tanstack/react-router";
import { Calendar, DollarSign, History, Menu, Mic, Moon, Package, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import { MobileFrame } from "@/components/MobileFrame";

export const Route = createFileRoute("/chat")({
  head: () => ({ meta: [{ title: "Concierge — Aura" }] }),
  component: ChatPage,
});

type Msg = { from: "ai" | "me"; text: string; time: string };

const initial: Msg[] = [
  { from: "ai", text: "I checked your day. Two items may need your attention.", time: "9:21 AM" },
  { from: "me", text: "Thanks! What should I focus on first?", time: "9:22 AM" },
  { from: "ai", text: "Your 2pm meeting may conflict with a delivery window, and grocery budget is over by $24.", time: "9:22 AM" },
  { from: "me", text: "Can you handle the delivery reschedule?", time: "9:23 AM" },
  { from: "ai", text: "On it. I'll update you once it's confirmed.", time: "9:23 AM" },
];

const quick = [
  { label: "Schedule", Icon: Calendar },
  { label: "Orders", Icon: Package },
  { label: "Budget", Icon: DollarSign },
  { label: "Sleep", Icon: Moon },
];

function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [text, setText] = useState("");

  const send = () => {
    const t = text.trim();
    if (!t) return;
    setMessages((m) => [...m, { from: "me", text: t, time: "now" }]);
    setText("");
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        { from: "ai", text: "Got it — I'll take care of that and follow up shortly.", time: "now" },
      ]);
    }, 700);
  };

  return (
    <MobileFrame>
      <div className="flex h-[calc(100vh-7rem)] flex-col px-5">
        <header className="flex items-center justify-between pb-3">
          <button className="rounded-full bg-card/70 p-2"><Menu className="h-4 w-4" /></button>
          <div className="text-center">
            <div className="font-display text-lg">Concierge</div>
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> Online
            </div>
          </div>
          <button className="rounded-full bg-card/70 p-2"><History className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto py-2">
          {messages.map((m, i) => (
            <div key={i} className={`flex items-end gap-2 ${m.from === "me" ? "justify-end" : ""}`}>
              {m.from === "ai" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-card ${
                  m.from === "me"
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md bg-card/80"
                }`}
              >
                <p>{m.text}</p>
                <div className={`mt-1 text-[10px] ${m.from === "me" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {m.time}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
          {quick.map(({ label, Icon }) => (
            <button
              key={label}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs text-muted-foreground"
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-full bg-card/70 px-2 py-2 shadow-card">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Message your AI concierge…"
            className="flex-1 bg-transparent px-3 text-sm placeholder:text-muted-foreground focus:outline-none"
          />
          <button className="p-2 text-muted-foreground"><Mic className="h-4 w-4" /></button>
          <button
            onClick={send}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </MobileFrame>
  );
}
