import type { User } from "@supabase/supabase-js";
import {
  clearUserMonthlyCapOverride,
  hasUserMonthlyCapOverride,
  readBudgetSettings,
  syncBudgetWithApprovedSpend,
} from "@/lib/budget-store";
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
/** Bump when persona lifestyle sections change so stale localStorage is refreshed. */
const LIFESTYLE_CONTENT_VERSION = 2;
const ACTIVE_PERSONA_KEY = "simone-active-persona-id";

function savedBudgetBelongsToAnotherPersona(
  currentPersona: PersonaBundle,
  saved = readBudgetSettings(),
): boolean {
  for (const p of PERSONAS) {
    if (p.id === currentPersona.id) continue;
    if (saved.period === p.budget.period && saved.amount === p.budget.amount) return true;
  }
  return false;
}

/**
 * Align budget with signed-in persona only when another persona's cap is still stored.
 * Never reset a user-raised monthly cap (e.g. after Approvals budget save).
 */
export function ensurePersonaBudgetForEmail(email: string | undefined | null): void {
  if (typeof window === "undefined") return;
  const persona = resolvePersonaByEmail(email);
  if (!persona) return;
  if (hasUserMonthlyCapOverride()) return;
  if (savedBudgetBelongsToAnotherPersona(persona)) {
    clearUserMonthlyCapOverride();
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

export function resolvePersonaByUser(
  user: Pick<User, "id" | "email"> | null | undefined,
): PersonaBundle | null {
  if (!user) return null;
  return resolvePersonaByEmail(user.email) ?? PERSONAS.find((p) => p.id === user.id) ?? null;
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

export function personaToStoredLifestyle(persona: PersonaBundle): StoredPersonaLifestyle {
  return {
    personaId: persona.id,
    wellness: persona.wellness,
    insight: persona.insight,
    recommendations: persona.recommendations,
    notifications: persona.notifications,
    preferences: persona.preferences,
    weekOverview: persona.weekOverview,
  };
}

type StoredPersonaLifestyleEnvelope = StoredPersonaLifestyle & { contentVersion?: number };

function storedLifestyleIsStale(stored: StoredPersonaLifestyle | null, persona: PersonaBundle): boolean {
  if (!stored || stored.personaId !== persona.id) return true;
  const env = stored as StoredPersonaLifestyleEnvelope;
  if ((env.contentVersion ?? 0) < LIFESTYLE_CONTENT_VERSION) return true;
  const live = personaToStoredLifestyle(persona);
  const liveHasSections =
    live.recommendations.length > 0 &&
    live.notifications.length > 0 &&
    live.weekOverview.length > 0;
  const storedMissingSections =
    stored.recommendations.length === 0 ||
    stored.notifications.length === 0 ||
    stored.weekOverview.length === 0;
  return liveHasSections && storedMissingSections;
}

/** Merge live persona bundle with stored wellness (Home always shows full sections from code). */
export function mergeHomePersonaLifestyle(
  persona: PersonaBundle,
  stored: StoredPersonaLifestyle | null,
): StoredPersonaLifestyle {
  const live = personaToStoredLifestyle(persona);
  if (!stored || stored.personaId !== persona.id) return live;
  return {
    ...live,
    wellness: { ...live.wellness, ...stored.wellness },
  };
}

export function writePersonaLifestyleStore(persona: PersonaBundle): void {
  if (typeof window === "undefined") return;
  const payload: StoredPersonaLifestyleEnvelope = {
    ...personaToStoredLifestyle(persona),
    contentVersion: LIFESTYLE_CONTENT_VERSION,
  };
  localStorage.setItem(LIFESTYLE_STORAGE_KEY, JSON.stringify(payload));
}

/** Home lifestyle sections — live persona content merged with stored wellness. */
export function getHomePersonaLifestyle(
  email: string | undefined | null,
  userId?: string | null,
): StoredPersonaLifestyle | null {
  const persona = resolvePersonaByEmail(email) ?? (userId ? PERSONAS.find((p) => p.id === userId) : null);
  if (!persona) return null;
  const stored = readStoredPersonaLifestyle();
  const merged = mergeHomePersonaLifestyle(persona, stored);
  if (typeof window !== "undefined" && storedLifestyleIsStale(stored, persona)) {
    writePersonaLifestyleStore(persona);
  }
  return merged;
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
  const personaChanged = prevActive !== null && prevActive !== persona.id;
  const firstPersonaBind = prevActive === null;
  const skipContentSeed =
    !opts?.force && !personaChanged && !firstPersonaBind && Boolean(localStorage.getItem(persona.seededFlagKey));

  writePersonaLifestyleStore(persona);

  if (!skipContentSeed) {
    const events = persona.scheduleToday();
    localStorage.setItem("simone-demo-events", JSON.stringify(events));
    localStorage.setItem(persona.seededFlagKey, new Date().toISOString());
    localStorage.setItem("simone-demo-messages", JSON.stringify(persona.chatMessages()));
  }

  localStorage.setItem(ACTIVE_PERSONA_KEY, persona.id);

  if (personaChanged || opts?.force) {
    replacePendingOrders(orders);
    resetApprovalsPending(persona.approvals(orders));
    clearUserMonthlyCapOverride();
    syncBudgetWithApprovedSpend(persona.budget);
  } else if (firstPersonaBind) {
    replacePendingOrders(orders);
    resetApprovalsPending(persona.approvals(orders));
    if (!hasUserMonthlyCapOverride()) {
      syncBudgetWithApprovedSpend(persona.budget);
    }
  }

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
