// P14 · AI provider slots (D30). Keys come only from the environment (.env is git-ignored).
//
// Every API key is a "slot". For each capability the chain tries slots in order: providers in
// AI_PROVIDER_ORDER, and within a provider its keys in the order they're listed. A slot that hits a
// rate limit cools down and the next one is tried, so several keys spread the free-tier load.
import type { Env } from "../../config/env.js";

export const PROVIDERS = ["groq", "gemini", "openrouter"] as const;
export type ProviderKind = (typeof PROVIDERS)[number];

export const CAPABILITIES = ["text", "vision", "stt"] as const;
export type Capability = (typeof CAPABILITIES)[number];

/**
 * Defaults (D30, revised D37). Each capability has an ordered list: when a model 404s (retired, or not
 * offered to this account) the next model is tried on the same key. Free-tier catalogs change often:
 * override with <PROVIDER>_<CAPABILITY>_MODEL, comma-separated, e.g. GROQ_TEXT_MODEL=a,b.
 * Groq retired llama-3.3-70b-versatile (2026-08-16) and llama-4-scout (2026-07-17); Google stopped
 * offering gemini-2.5-* to new accounts (2026-09).
 */
export const DEFAULT_MODELS: Record<ProviderKind, Partial<Record<Capability, string[]>>> = {
  groq: {
    text: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
    vision: ["qwen/qwen3.8-27b"],
    stt: ["whisper-large-v3-turbo", "whisper-large-v3"],
  },
  gemini: {
    text: ["gemini-3.6-flash", "gemini-2.5-flash"],
    vision: ["gemini-3.6-flash", "gemini-2.5-flash"],
    stt: ["gemini-3.6-flash", "gemini-2.5-flash"],
  },
  // openrouter/free routes to a free model that supports the request (including images). No STT.
  openrouter: { text: ["openrouter/free"], vision: ["openrouter/free"] },
};

export type AiSlot = {
  /** Stable, key-free label for logs and the dev status endpoint, e.g. "groq#2". */
  id: string;
  provider: ProviderKind;
  apiKey: string;
  /** Models to try in order, per capability. */
  models: Partial<Record<Capability, string[]>>;
};

const listOf = (raw: string | undefined) =>
  (raw ?? "")
    .split(/[\s,]+/)
    .map((k) => k.trim())
    .filter(Boolean);

export function aiSlotsFromEnv(env: Env): AiSlot[] {
  const keys: Record<ProviderKind, string[]> = {
    groq: listOf(env.GROQ_API_KEYS),
    gemini: listOf(env.GEMINI_API_KEYS),
    openrouter: listOf(env.OPENROUTER_API_KEYS),
  };
  const models = (p: ProviderKind, c: Capability) => {
    const override = env[`${p.toUpperCase()}_${c.toUpperCase()}_MODEL` as keyof Env];
    const list = typeof override === "string" ? listOf(override) : [];
    return list.length ? list : DEFAULT_MODELS[p][c];
  };

  const slots: AiSlot[] = [];
  for (const provider of env.AI_PROVIDER_ORDER) {
    keys[provider].forEach((apiKey, i) => {
      const byCapability: Partial<Record<Capability, string[]>> = {};
      for (const c of CAPABILITIES) {
        const m = models(provider, c);
        if (m?.length) byCapability[c] = m;
      }
      slots.push({ id: `${provider}#${i + 1}`, provider, apiKey, models: byCapability });
    });
  }
  return slots;
}

/** Per-attempt and whole-request time limits (D30). */
export const TIMEOUTS_MS: Record<Capability, { attempt: number; total: number }> = {
  text: { attempt: 8_000, total: 20_000 },
  vision: { attempt: 15_000, total: 35_000 },
  stt: { attempt: 15_000, total: 35_000 },
};

/** How long a slot sits out after a failure, by kind. */
export const COOLDOWN_MS = {
  rateLimitDefault: 60_000,
  auth: 10 * 60_000,
  notFound: 10 * 60_000,
  transient: 15_000,
} as const;
