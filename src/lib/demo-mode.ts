import type { User } from "@supabase/supabase-js";

export const backendAvailable = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

export const demoUser = {
  id: "demo-user",
  aud: "authenticated",
  role: "authenticated",
  email: "demo@simone.local",
  app_metadata: {},
  user_metadata: { display_name: "Alex" },
  created_at: "2026-05-18T00:00:00.000Z",
} as User;

export type DemoEvent = {
  id: string;
  title: string;
  subtitle: string | null;
  start_time: string;
  level: "High" | "Medium" | "Low";
};

export type DemoMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export const demoProfile = { display_name: "Alex" };

export const demoWellness = {
  sleep_score: 82,
  readiness_score: 76,
  sleep_duration_min: 455,
};

const eventsKey = "simone-demo-events";
const messagesKey = "simone-demo-messages";

const todayAt = (hour: number, minute: number) => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

const defaultEvents = (): DemoEvent[] => [
  {
    id: "demo-1",
    title: "Client check-in",
    subtitle: "Review next steps",
    start_time: todayAt(15, 30),
    level: "High",
  },
  {
    id: "demo-2",
    title: "Recovery session",
    subtitle: "Sauna + cold plunge",
    start_time: todayAt(17, 30),
    level: "Medium",
  },
];

const safeRead = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const safeWrite = <T,>(key: string, value: T) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

export const getDemoEvents = () => safeRead<DemoEvent[]>(eventsKey, defaultEvents());

export const setDemoEvents = (events: DemoEvent[]) => safeWrite(eventsKey, events);

export const getDemoMessages = () => safeRead<DemoMessage[]>(messagesKey, []);

export const addDemoMessage = (message: Omit<DemoMessage, "id" | "created_at">) => {
  const next: DemoMessage = {
    ...message,
    id: `demo-message-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    created_at: new Date().toISOString(),
  };
  safeWrite(messagesKey, [...getDemoMessages(), next].slice(-50));
  return next;
};

export const scheduleDemoEvent = (title: string, startTime: string) => {
  const event: DemoEvent = {
    id: `demo-event-${Date.now()}`,
    title,
    subtitle: "Added by Simone",
    start_time: startTime,
    level: "Medium",
  };
  setDemoEvents([...getDemoEvents(), event].sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time)));
  return event;
};

export const cancelDemoEvent = (message: string) => {
  const events = getDemoEvents();
  const normalized = message.toLowerCase();
  const match = events.find((event) => {
    const titleWords = event.title.toLowerCase().split(/\s+/).filter((word) => word.length > 2);
    return titleWords.some((word) => normalized.includes(word));
  }) ?? events.find((event) => new Date(event.start_time).getTime() >= Date.now());

  if (!match) return null;
  setDemoEvents(events.filter((event) => event.id !== match.id));
  return match;
};
