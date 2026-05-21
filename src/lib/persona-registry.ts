import type { User } from "@supabase/supabase-js";
import { writeBudgetSettings } from "@/lib/budget-store";
import type { DemoMessage } from "@/lib/demo-mode";
import {
  isJordanRossEmail,
  JORDAN_ROSS_EMAIL,
  jordanRossInsight,
  jordanRossPersona,
  jordanRossProfile,
  jordanRossUser,
  jordanRossWellness,
} from "@/lib/jordan-ross-sample";
import {
  isKevinZhangEmail,
  KEVIN_ZHANG_EMAIL,
  kevinZhangInsight,
  kevinZhangPersona,
  kevinZhangProfile,
  kevinZhangUser,
  kevinZhangWellness,
} from "@/lib/kevin-zhang-sample";
import type { PersonaBundle, PersonaWellness } from "@/lib/persona-types";

export const LIFESTYLE_STORAGE_KEY = "simone-persona-lifestyle";

export type StoredPersonaLifestyle = {
  personaId: string;
  wellness: PersonaWellness;
  insight: string;
  recommendations: string[];
  notifications: PersonaBundle["notifications"];
  preferences: PersonaBundle["preferences"];
  weekOverview: PersonaBundle["weekOverview"];
};

const PERSONAS: PersonaBundle[] = [jordanRossPersona, kevinZhangPersona];

export function resolvePersonaByEmail(email: string | undefined | null): PersonaBundle | null {
  const e = email?.trim().toLowerCase();
  if (!e) return null;
  if (isJordanRossEmail(e)) return jordanRossPersona;
  if (isKevinZhangEmail(e)) return kevinZhangPersona;
  return PERSONAS.find((p) => p.user.email?.toLowerCase() === e) ?? null;
}

export function getInsightForEmail(email: string | undefined | null): string | null {
  return resolvePersonaByEmail(email)?.insight ?? null;
}

export function getWellnessForEmail(email: string | undefined | null): PersonaWellness | null {
  return resolvePersonaByEmail(email)?.wellness ?? null;
}

export function readStoredPersonaLifestyle(): StoredPersonaLifestyle | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LIFESTYLE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredPersonaLifestyle) : null;
  } catch {
    return null;
  }
}

export function applyPersonaSampleData(email: string, opts?: { force?: boolean }): void {
  if (typeof window === "undefined") return;
  const persona = resolvePersonaByEmail(email);
  if (!persona) return;
  if (!opts?.force && localStorage.getItem(persona.seededFlagKey)) return;

  const events = persona.scheduleToday();
  const orders = persona.orders();

  localStorage.setItem("simone-demo-events", JSON.stringify(events));
  localStorage.setItem(persona.seededFlagKey, new Date().toISOString());
  localStorage.setItem(
    LIFESTYLE_STORAGE_KEY,
    JSON.stringify({
      personaId: persona.id,
      wellness: persona.wellness,
      insight: persona.insight,
      recommendations: persona.recommendations,
      notifications: persona.notifications,
      preferences: persona.preferences,
      weekOverview: persona.weekOverview,
    } satisfies StoredPersonaLifestyle),
  );
  localStorage.setItem("simone-demo-messages", JSON.stringify(persona.chatMessages()));

  writeBudgetSettings(persona.budget);

  void import("@/lib/pending-orders-store").then((m) => m.replacePendingOrders(orders));
  void import("@/lib/approvals-store").then((m) => m.resetApprovalsPending(persona.approvals(orders)));

  window.dispatchEvent(new Event("simone-demo-events-changed"));
}

export function applyPersonaForUser(user: User | null | undefined, opts?: { force?: boolean }) {
  if (!user?.email) return;
  applyPersonaSampleData(user.email, opts);
}

export function applyJordanRossSampleData(opts?: { force?: boolean }): void {
  applyPersonaSampleData(JORDAN_ROSS_EMAIL, opts);
}

export function applyKevinZhangSampleData(opts?: { force?: boolean }): void {
  applyPersonaSampleData(KEVIN_ZHANG_EMAIL, opts);
}

// Re-exports for existing imports
export {
  isJordanRossEmail,
  isKevinZhangEmail,
  JORDAN_ROSS_EMAIL,
  KEVIN_ZHANG_EMAIL,
  jordanRossUser,
  kevinZhangUser,
  jordanRossProfile,
  jordanRossWellness,
  kevinZhangWellness,
  jordanRossInsight,
  kevinZhangInsight,
  kevinZhangProfile,
};
