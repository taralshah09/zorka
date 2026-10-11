// P14 · AI client with fallback across slots (D30).
//
// For each request the client walks the slots that support the capability, skipping any in cooldown.
// Rate limits (429) cool a slot down for Retry-After (default 60 s); bad keys and unknown models for
// 10 min; timeouts, 5xx and network errors for 15 s. Invalid output just moves on to the next slot.
// Usage (slot, model, latency, tokens, outcome) is logged with pino and counted for /v1/dev/ai/status.
import type { Logger } from "pino";
import type { z } from "zod";

import { AppError } from "../../http/errors.js";
import { COOLDOWN_MS, TIMEOUTS_MS, type AiSlot, type Capability } from "./ai.config.js";
import {
  chat,
  ProviderError,
  transcribe,
  type AudioInput,
  type ChatRequest,
  type Fetch,
  type FailureKind,
  type ImageInput,
  type Usage,
} from "./providers.js";

export type AiMeta = { slot: string; model: string; ms: number; attempts: number; usage: Usage };

type SlotStats = {
  calls: number;
  ok: number;
  failures: Partial<Record<FailureKind, number>>;
  cooldownUntil: number;
  lastError: string | null;
  totalMs: number;
  inputTokens: number;
  outputTokens: number;
};

export type AiStatus = {
  configured: boolean;
  slots: {
    id: string;
    provider: AiSlot["provider"];
    models: AiSlot["models"];
    calls: number;
    ok: number;
    failures: Partial<Record<FailureKind, number>>;
    coolingDownForMs: number;
    avgMs: number | null;
    inputTokens: number;
    outputTokens: number;
    lastError: string | null;
  }[];
};

export interface AiClient {
  /** Plain text completion (dev endpoint). */
  chat(req: { system?: string; user: string }): Promise<{ text: string; meta: AiMeta }>;
  /** Text or image → a JSON object validated by `schema`. Invalid output falls through to the next slot. */
  json<S extends z.ZodType>(req: { system: string; user: string; image?: ImageInput; schema: S }): Promise<{ value: z.infer<S>; meta: AiMeta }>;
  transcribe(audio: AudioInput, vocabularyHint: string): Promise<{ text: string; meta: AiMeta }>;
  status(): AiStatus;
}

/** Pulls the first JSON object out of a model reply (handles ```json fences and chatter around it). */
export function extractJson(raw: string): unknown {
  // Reasoning models may prepend <think>…</think>, which can itself contain braces.
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new ProviderError("bad_output", "No JSON object in reply");
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new ProviderError("bad_output", "Reply was not valid JSON");
  }
}

export function createAiClient({
  slots,
  logger,
  fetchImpl = globalThis.fetch,
  now = Date.now,
}: {
  slots: AiSlot[];
  logger: Logger;
  fetchImpl?: Fetch;
  now?: () => number;
}): AiClient {
  const stats = new Map<string, SlotStats>(
    slots.map((s) => [
      s.id,
      { calls: 0, ok: 0, failures: {}, cooldownUntil: 0, lastError: null, totalMs: 0, inputTokens: 0, outputTokens: 0 },
    ]),
  );

  function cooldownFor(err: ProviderError): number {
    switch (err.kind) {
      case "rate_limit":
        return err.retryAfterMs ?? COOLDOWN_MS.rateLimitDefault;
      case "auth":
        return COOLDOWN_MS.auth;
      case "not_found":
        return COOLDOWN_MS.notFound;
      case "server":
      case "timeout":
      case "network":
        return COOLDOWN_MS.transient;
      default:
        return 0;
    }
  }

  /** A retired / unavailable model sits out on its own, so the key's other models (e.g. Whisper) keep working. */
  const modelCooldown = new Map<string, number>();
  const modelKey = (slot: AiSlot, capability: Capability, model: string) => `${slot.id}|${capability}|${model}`;

  async function run<T>(
    capability: Capability,
    attempt: (slot: AiSlot, model: string, signal: AbortSignal) => Promise<{ value: T; model: string; usage: Usage }>,
  ): Promise<{ value: T; meta: AiMeta }> {
    const eligible = slots.filter(
      (s) => s.models[capability]?.length && !(capability === "stt" && s.provider === "openrouter"),
    );
    if (!eligible.length) {
      throw new AppError("AI_UNAVAILABLE", "AI isn't set up on the server yet. Use search instead.", {
        reason: "not_configured",
      });
    }

    const { attempt: perAttempt, total } = TIMEOUTS_MS[capability];
    const started = now();
    const kinds: FailureKind[] = [];
    let attempts = 0;
    let soonestFree = Infinity;

    slots: for (const slot of eligible) {
      const st = stats.get(slot.id)!;
      for (const model of slot.models[capability]!) {
        if (st.cooldownUntil > now()) {
          soonestFree = Math.min(soonestFree, st.cooldownUntil);
          continue slots;
        }
        const mk = modelKey(slot, capability, model);
        if ((modelCooldown.get(mk) ?? 0) > now()) continue;
        const remaining = total - (now() - started);
        if (remaining <= 500) break slots;

        attempts++;
        st.calls++;
        const t0 = now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(perAttempt, remaining));
        try {
          const { value, model: used, usage } = await attempt(slot, model, controller.signal);
          const ms = now() - t0;
          st.ok++;
          st.totalMs += ms;
          st.inputTokens += usage.inputTokens;
          st.outputTokens += usage.outputTokens;
          st.lastError = null;
          logger.info({ ai: { capability, slot: slot.id, model: used, ms, attempts, usage, outcome: "ok" } }, "ai call");
          return { value, meta: { slot: slot.id, model: used, ms: now() - started, attempts, usage } };
        } catch (raw) {
          const err =
            raw instanceof ProviderError
              ? raw
              : controller.signal.aborted
                ? new ProviderError("timeout", "Timed out")
                : new ProviderError("bad_output", raw instanceof Error ? raw.message : "Unexpected error");
          st.failures[err.kind] = (st.failures[err.kind] ?? 0) + 1;
          st.lastError = `${model} · ${err.kind}: ${err.message}`.slice(0, 240);
          kinds.push(err.kind);
          // Provider error bodies never contain our keys; they're cut to 300 characters in providers.ts.
          logger.warn(
            {
              ai: { capability, slot: slot.id, model, ms: now() - t0, outcome: err.kind, status: err.status },
              detail: err.message.slice(0, 200),
            },
            "ai call failed, trying next",
          );
          const cool = cooldownFor(err);
          if (err.kind === "not_found") {
            modelCooldown.set(mk, now() + cool); // this model only → try the key's next model
          } else if (err.kind === "bad_request" || err.kind === "bad_output") {
            // try the key's next model, no cooldown
          } else {
            st.cooldownUntil = now() + cool; // limits, bad key, outage → the whole key sits out
            soonestFree = Math.min(soonestFree, st.cooldownUntil);
            continue slots;
          }
        } finally {
          clearTimeout(timer);
        }
      }
    }

    const waitS = Number.isFinite(soonestFree) ? Math.max(1, Math.ceil((soonestFree - now()) / 1000)) : null;
    if (kinds.length === 0) {
      throw new AppError(
        "RATE_LIMITED",
        `Every AI key is resting after a limit or an error${waitS ? `. Try again in about ${waitS} s` : ""}, or use search.`,
        { retryAfterSeconds: waitS },
      );
    }
    if (kinds.every((k) => k === "rate_limit")) {
      throw new AppError(
        "RATE_LIMITED",
        `All AI keys are at their free-tier limit${waitS ? `. Try again in about ${waitS} s` : ""}, or use search.`,
        { retryAfterSeconds: waitS },
      );
    }
    if (kinds.every((k) => k === "timeout")) {
      throw new AppError("AI_TIMEOUT", "The AI took too long. Try again, or use search.");
    }
    if (kinds.every((k) => k === "bad_output")) {
      throw new AppError("AI_UNAVAILABLE", "The AI couldn't read that. Try rephrasing, or use search.", { reason: "bad_output" });
    }
    throw new AppError("AI_UNAVAILABLE", "AI isn't available right now. Use search instead.", { reason: "failed" });
  }

  return {
    chat: async (req) => {
      const r = await run("text", async (slot, model, signal) => {
        const out = await chat(fetchImpl, slot, model, "text", req, signal);
        return { value: out.text, model: out.model, usage: out.usage };
      });
      return { text: r.value, meta: r.meta };
    },

    json: async ({ system, user, image, schema }) => {
      const capability = image ? "vision" : "text";
      const req: ChatRequest = { system, user, image, json: true };
      const r = await run(capability, async (slot, model, signal) => {
        const out = await chat(fetchImpl, slot, model, capability, req, signal);
        const parsed = schema.safeParse(extractJson(out.text));
        if (!parsed.success) throw new ProviderError("bad_output", `Output didn't match the schema: ${parsed.error.issues[0]?.message ?? ""}`);
        return { value: parsed.data, model: out.model, usage: out.usage };
      });
      return { value: r.value, meta: r.meta };
    },

    transcribe: async (audio, vocabularyHint) => {
      const r = await run("stt", async (slot, model, signal) => {
        const out = await transcribe(fetchImpl, slot, model, audio, vocabularyHint, signal);
        return { value: out.text, model: out.model, usage: out.usage };
      });
      return { text: r.value, meta: r.meta };
    },

    status: () => ({
      configured: slots.length > 0,
      slots: slots.map((s) => {
        const st = stats.get(s.id)!;
        return {
          id: s.id,
          provider: s.provider,
          models: s.models,
          calls: st.calls,
          ok: st.ok,
          failures: st.failures,
          coolingDownForMs: Math.max(0, st.cooldownUntil - now()),
          avgMs: st.ok ? Math.round(st.totalMs / st.ok) : null,
          inputTokens: st.inputTokens,
          outputTokens: st.outputTokens,
          lastError: st.lastError,
        };
      }),
    }),
  };
}
