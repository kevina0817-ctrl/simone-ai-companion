import type { User } from "@supabase/supabase-js";
import { resolvePersonaByEmail } from "@/lib/persona-registry";

type ProfileNameSource = { display_name?: string | null } | null | undefined;

function titleCaseWord(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Build a display name from signup first / last name fields. */
export function buildDisplayNameFromParts(firstName: string, lastName: string): string {
  const parts = [firstName.trim(), lastName.trim()].filter(Boolean);
  if (parts.length === 0) return "";
  return parts.map(titleCaseWord).join(" ");
}

/** Turn email local-part / handle into a spaced display name (e.g. jordan.ross → Jordan Ross). */
export function formatHandleToDisplayName(handle: string): string {
  const trimmed = handle.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/[._-]+/).filter(Boolean);
  if (parts.length > 1) {
    return parts.map(titleCaseWord).join(" ");
  }
  return titleCaseWord(trimmed);
}

function formatDisplayName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/\s/.test(trimmed)) {
    return trimmed.split(/\s+/).map(titleCaseWord).join(" ");
  }
  return formatHandleToDisplayName(trimmed);
}

/** True when the stored value is a username/handle, not a full display name. */
export function isHandleLikeDisplayName(
  displayName: string,
  email?: string | null,
): boolean {
  const t = displayName.trim();
  if (!t) return true;
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && t.toLowerCase() === local) return true;
  if (!/\s/.test(t) && t === t.toLowerCase()) return true;
  return false;
}

/**
 * Prefer profiles.display_name / user_metadata when they are real names;
 * fall back to persona full names, then formatted handle.
 */
export function resolveUserDisplayName(
  user: Pick<User, "email" | "user_metadata"> | null | undefined,
  profile?: ProfileNameSource,
): string {
  if (!user) return "friend";

  const persona = resolvePersonaByEmail(user.email);
  const personaName = persona?.profile.display_name?.trim();

  const profileName = profile?.display_name?.trim();
  if (profileName && !isHandleLikeDisplayName(profileName, user.email)) {
    return formatDisplayName(profileName);
  }

  const metaName =
    typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name.trim()
      : "";
  if (metaName && !isHandleLikeDisplayName(metaName, user.email)) {
    return formatDisplayName(metaName);
  }

  if (personaName) return personaName;

  if (profileName) return formatDisplayName(profileName);
  if (metaName) return formatDisplayName(metaName);

  const local = user.email?.split("@")[0];
  if (local) return formatHandleToDisplayName(local);

  return "friend";
}
