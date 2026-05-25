import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ENV_KEYS = ["AGNIC_TOKEN", "LOVABLE_API_KEY"] as const;

let diskEnvLoaded = false;

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Load server-only AI keys from .env files when not already in process.env (local dev). */
export function loadAiEnvFromDisk(): void {
  if (diskEnvLoaded || typeof process === "undefined") return;
  diskEnvLoaded = true;

  const cwd = process.cwd();
  const candidates = [".env", ".env.local", "backend/.env"];

  for (const rel of candidates) {
    const path = join(cwd, rel);
    if (!existsSync(path)) continue;
    try {
      const vars = parseEnvFile(readFileSync(path, "utf8"));
      for (const key of ENV_KEYS) {
        const value = vars[key]?.trim();
        if (value && !process.env[key]) process.env[key] = value;
      }
    } catch {
      // ignore unreadable env files
    }
  }
}

export function getAgnicToken(): string | undefined {
  loadAiEnvFromDisk();
  const token = process.env.AGNIC_TOKEN?.trim();
  return token || undefined;
}

export function getLovableApiKey(): string | undefined {
  loadAiEnvFromDisk();
  const key = process.env.LOVABLE_API_KEY?.trim();
  return key || undefined;
}
