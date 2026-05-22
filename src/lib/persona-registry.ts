import type { User } from "@supabase/supabase-js";
import { readBudgetSettings, syncBudgetWithApprovedSpend } from "@/lib/budget-store";
import { resetApprovalsPending } from "@/lib/approvals-store";
import { replacePendingOrders } from "@/lib/pending-orders-store";
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
import {
  isNicoleHartEmail,
  NICOLE_HART_EMAIL,
  nicoleHartInsight,
  nicoleHartPersona,
  nicoleHartProfile,
  nicoleHartUser,
  nicoleHartWellness,
} from "@/lib/nicole-hart-sample";
import type { PersonaBundle, PersonaWellness } from "@/lib/persona-types";

export const LIFESTYLE_STORAGE_KEY = "simone-persona-lifestyle";
const ACTIVE_PERSONA_KEY = "simone-active-persona-id";

function personaBudgetMatches(persona: PersonaBundle): boolean {
  const saved = readBudgetSettings();
  return saved.period === persona.budget.period && saved.amount === persona.budget.amount;
}

/** Always align Orders budget cap with the signed-in persona (e.g. Nicole $2200 not Kevin $850). */
export function ensurePersonaBudgetForEmail(email: string | undefined | null): void {
  if (typeof window === "undefined") return;
  const persona = resolvePersonaByEmail(email);
  if (!persona) return;
  if (!personaBudgetMatches(persona)) {
    syncBudgetWithApprovedSpend(persona.budget);
  }
}

export type StoredPersonaLifestyle = {
  personaId: string;
  wellness: PersonaWellness;
  insight: string;
  recommendations: string[];
  notifications: PersonaBundle["notifications"];
  preferences: PersonaBundle["preferences"];
  weekOverview: PersonaBundle["weekOverview"];
};

const PERSONAS: PersonaBundle[] = [jordanRossPersona, kevinZhangPersona, nicoleHartPersona];

export function resolvePersonaByEmail(email: string | undefined | null): PersonaBundle | null {
  const e = email?.trim().toLowerCase();
  if (!e) return null;
  if (isJordanRossEmail(e)) return jordanRossPersona;
  if (isKevinZhangEmail(e)) return kevinZhangPersona;
  if (isNicoleHartEmail(e)) return nicoleHartPersona;
  return PERSONAS.find((p) => p.user.email?.toLowerCase() === e) ?? null;
}

export function getInsightForEmail(email: string | undefined | null): string | null {
  return resolvePersonaByEmail(email)?.insight ?? null;
}

export function getWellnessForEmail(email: string | undefined | null): PersonaWellness | null {
  const stored = readStoredPersonaLifestyle();
  const persona = resolvePersonaByEmail(email);
  if (stored && persona && stored.personaId === persona.id) {
    return stored.wellness;
  }
  return persona?.wellness ?? null;
}

type WellnessDbRow = {
  sleep_score?: number | null;
  readiness_score?: number | null;
  sleep_duration_min?: number | null;
} | null;

/** Home ring scores: persona mock data, merged with Supabase row when present. */
export function resolveHomeWellness(
  email: string | undefined | null,
  dbRow: WellnessDbRow,
): PersonaWellness | null {
  const persona = getWellnessForEmail(email);
  if (!persona) return dbRow as PersonaWellness | null;

  if (!dbRow) return persona;

  return {
    ...persona,
    sleep_score: dbRow.sleep_score ?? persona.sleep_score,
    readiness_score: dbRow.readiness_score ?? persona.readiness_score,
    sleep_duration_min: dbRow.sleep_duration_min ?? persona.sleep_duration_min,
  };
}

export function getSleepRingMeta(wellness: PersonaWellness | null | undefined) {
  const score = wellness?.sleep_score ?? 0;
  const min = wellness?.sleep_duration_min;
  return {
    value: score,
    status:
      score >= 90 ? "Excellent" : score >= 75 ? "Good" : score >= 60 ? "Fair" : score > 0 ? "Low" : "—",
    detail: min != null ? `${Math.floor(min / 60)}h ${min % 60}m` : "No data",
  };
}

export function getReadinessRingMeta(wellness: PersonaWellness | null | undefined) {
  const score = wellness?.readiness_score ?? 0;
  return {
    value: score,
    status:
      score >= 92 ? "Peak" : score >= 88 ? "High" : score >= 70 ? "Steady" : score > 0 ? "Moderate" : "—",
    detail:
      score >= 92
        ? "Glowing"
        : score >= 88
          ? "Peak form"
          : score >= 70
            ? "Aligned"
            : score > 0
              ? "Recovery needed"
              : "No data",
  };
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

  const orders = persona.orders();
  const prevActive = localStorage.getItem(ACTIVE_PERSONA_KEY);
  const personaChanged = prevActive !== persona.id;
  const skipContentSeed =
    !opts?.force && !personaChanged && Boolean(localStorage.getItem(persona.seededFlagKey));

  if (!skipContentSeed) {
    const events = persona.scheduleToday();
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
  }

  localStorage.setItem(ACTIVE_PERSONA_KEY, persona.id);
  replacePendingOrders(orders);
  resetApprovalsPending(persona.approvals(orders));
  syncBudgetWithApprovedSpend(persona.budget);

  window.dispatchEvent(new Event("simone-demo-events-changed"));
  window.dispatchEvent(new Event("simone-persona-wellness-changed"));
}

export function applyPersonaForUser(user: User | null | undefined, opts?: { force?: boolean }) {
  if (!user?.email) return;
  applyPersonaSampleData(user.email, opts);
  ensurePersonaBudgetForEmail(user.email);
}

export function applyJordanRossSampleData(opts?: { force?: boolean }): void {
  applyPersonaSampleData(JORDAN_ROSS_EMAIL, opts);
}

export function applyKevinZhangSampleData(opts?: { force?: boolean }): void {
  applyPersonaSampleData(KEVIN_ZHANG_EMAIL, opts);
}

export function applyNicoleHartSampleData(opts?: { force?: boolean }): void {
  applyPersonaSampleData(NICOLE_HART_EMAIL, opts);
}

// Re-exports for existing imports
export {
  isJordanRossEmail,
  isKevinZhangEmail,
  isNicoleHartEmail,
  JORDAN_ROSS_EMAIL,
  KEVIN_ZHANG_EMAIL,
  NICOLE_HART_EMAIL,
  jordanRossUser,
  kevinZhangUser,
  nicoleHartUser,
  jordanRossProfile,
  jordanRossWellness,
  kevinZhangWellness,
  nicoleHartWellness,
  jordanRossInsight,
  kevinZhangInsight,
  nicoleHartInsight,
  kevinZhangProfile,
  nicoleHartProfile,
};
