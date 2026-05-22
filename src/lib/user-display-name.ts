import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { backendAvailable } from "@/lib/demo-mode";
import { isDemoPersonaEmail, resolvePersonaByEmail } from "@/lib/persona-registry";

type ProfileNameSource = { display_name?: string | null } | null | undefined;

export const PROFILE_DISPLAY_NAME_UPDATED = "simone-profile-display-name-updated";

function titleCaseWord(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Build a display name from signup first / last name fields (preserves exact casing). */
export function buildDisplayNameFromParts(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

/** Stored or user-entered display name — no title-casing. */
function preserveDisplayName(raw: string): string {
  return raw.trim();
}

/** Read first + last (or display_name) from auth user_metadata after signup. */
export function resolveNameFromUserMetadata(
  metadata: User["user_metadata"] | undefined,
): string {
  if (!metadata || typeof metadata !== "object") return "";

  const first =
    typeof metadata.first_name === "string" ? metadata.first_name.trim() : "";
  const last =
    typeof metadata.last_name === "string" ? metadata.last_name.trim() : "";
  const fromParts = buildDisplayNameFromParts(first, last);
  if (fromParts) return fromParts;

  const display =
    typeof metadata.display_name === "string" ? metadata.display_name.trim() : "";
  if (display) return preserveDisplayName(display);

  return "";
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
 * Prefer profiles.display_name / signup metadata (first + last);
 * demo persona emails always use bundled names.
 */
export function resolveUserDisplayName(
  user: Pick<User, "email" | "user_metadata"> | null | undefined,
  profile?: ProfileNameSource,
): string {
  if (!user) return "friend";

  const persona = resolvePersonaByEmail(user.email);
  if (isDemoPersonaEmail(user.email) && persona?.profile.display_name) {
    return persona.profile.display_name;
  }

  const fromMetadata = resolveNameFromUserMetadata(user.user_metadata);
  const profileName = profile?.display_name?.trim();

  if (profileName && !isHandleLikeDisplayName(profileName, user.email)) {
    return preserveDisplayName(profileName);
  }

  if (fromMetadata && !isHandleLikeDisplayName(fromMetadata, user.email)) {
    return preserveDisplayName(fromMetadata);
  }

  if (profileName) return formatDisplayName(profileName);

  const metaDisplay =
    typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name.trim()
      : "";
  if (metaDisplay && !isHandleLikeDisplayName(metaDisplay, user.email)) {
    return preserveDisplayName(metaDisplay);
  }
  if (metaDisplay) return formatDisplayName(metaDisplay);

  const local = user.email?.split("@")[0];
  if (local) return formatHandleToDisplayName(local);

  return "friend";
}

/**
 * Persist signup / metadata name to profiles so Home and Chat survive refresh.
 * Skips demo persona accounts.
 */
export async function syncProfileDisplayNameFromUser(user: User): Promise<void> {
  if (!backendAvailable || typeof window === "undefined") return;
  if (isDemoPersonaEmail(user.email)) return;

  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (readError) return;

  const canonical = resolveUserDisplayName(user, profile);
  if (!canonical || canonical === "friend") return;

  const stored = profile?.display_name?.trim() ?? "";
  if (stored === canonical) return;

  const { error: writeError } = await supabase
    .from("profiles")
    .update({ display_name: canonical, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (!writeError && typeof window !== "undefined") {
    window.dispatchEvent(new Event(PROFILE_DISPLAY_NAME_UPDATED));
  }
}
