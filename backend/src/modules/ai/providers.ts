// P14 · Raw provider calls over fetch (no SDKs, D30). Groq, Gemini and OpenRouter all expose an
// OpenAI-compatible /chat/completions; speech-to-text uses Groq's Whisper endpoint or Gemini's native
// generateContent with inline audio. Every failure becomes a ProviderError with a `kind` the chain
// uses to decide how long the slot sits out.
import type { AiSlot, Capability } from "./ai.config.js";

export type FailureKind = "rate_limit" | "auth" | "not_found" | "bad_request" | "server" | "timeout" | "network" | "bad_output";

export class ProviderError extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string,
    readonly status?: number,
    /** From a 429's Retry-After header. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

export type Usage = { inputTokens: number; outputTokens: number };
export type ImageInput = { base64: string; mimeType: string };
export type AudioInput = { base64: string; mimeType: string };

const CHAT_BASE: Record<AiSlot["provider"], string> = {
  groq: "https://api.groq.com/openai/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  openrouter: "https://openrouter.ai/api/v1",
};

export type Fetch = typeof globalThis.fetch;

function retryAfterMs(res: Response): number | undefined {
  const h = res.headers.get("retry-after");
  if (!h) return undefined;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(1_000, secs * 1_000);
  const at = Date.parse(h);
  return Number.isFinite(at) ? Math.max(1_000, at - Date.now()) : undefined;
}

/** Turns a non-2xx response into a ProviderError. The body is shortened and never contains keys. */
async function failure(res: Response): Promise<ProviderError> {
  const body = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
  const msg = `HTTP ${res.status}${body ? `: ${body}` : ""}`;
  if (res.status === 429) return new ProviderError("rate_limit", msg, 429, retryAfterMs(res));
  if (res.status === 401 || res.status === 403) return new ProviderError("auth", msg, res.status);
  if (res.status === 404) return new ProviderError("not_found", msg, 404);
  if (res.status >= 500) return new ProviderError("server", msg, res.status);
  // Gemini reports an exhausted free quota as 400 RESOURCE_EXHAUSTED on some endpoints.
  if (/RESOURCE_EXHAUSTED|quota/i.test(body)) return new ProviderError("rate_limit", msg, res.status);
  return new ProviderError("bad_request", msg, res.status);
}

async function send(fetchImpl: Fetch, url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  try {
    return await fetchImpl(url, { ...init, signal });
  } catch (err) {
    if (signal.aborted) throw new ProviderError("timeout", "Timed out");
    throw new ProviderError("network", err instanceof Error ? err.message : "Network error");
  }
}

export type ChatRequest = {
  system?: string;
  user: string;
  image?: ImageInput;
  /** Ask for a JSON object (only sent where the provider is known to support it). */
  json?: boolean;
  maxTokens?: number;
};

/**
 * Keeps reasoning models from spending the reply budget on hidden "thinking" (and from putting it in the
 * reply): gpt-oss and Gemini 3 get low effort, Qwen gets its reasoning hidden.
 */
function reasoningParams(slot: AiSlot, model: string): Record<string, unknown> {
  if (slot.provider === "groq" && model.startsWith("openai/gpt-oss")) return { reasoning_effort: "low" };
  if (slot.provider === "groq" && model.startsWith("qwen/")) return { reasoning_format: "hidden" };
  if (slot.provider === "gemini" && /^gemini-3/.test(model)) return { reasoning_effort: "low" };
  return {};
}

/** One chat completion with `model`. Returns the assistant text. */
export async function chat(
  fetchImpl: Fetch,
  slot: AiSlot,
  model: string,
  capability: Extract<Capability, "text" | "vision">,
  req: ChatRequest,
  signal: AbortSignal,
): Promise<{ text: string; model: string; usage: Usage }> {
  const userContent = req.image
    ? [
        { type: "text", text: req.user },
        { type: "image_url", image_url: { url: `data:${req.image.mimeType};base64,${req.image.base64}` } },
      ]
    : req.user;
  const body: Record<string, unknown> = {
    model,
    temperature: 0.1,
    max_tokens: req.maxTokens ?? 2048,
    ...reasoningParams(slot, model),
    messages: [...(req.system ? [{ role: "system", content: req.system }] : []), { role: "user", content: userContent }],
  };
  // JSON mode is only requested where it's documented for these models (Groq text). Everyone else
  // gets the instruction in the prompt, and the caller validates the output either way.
  if (req.json && slot.provider === "groq" && capability === "text") body["response_format"] = { type: "json_object" };

  const headers: Record<string, string> = {
    authorization: `Bearer ${slot.apiKey}`,
    "content-type": "application/json",
  };
  if (slot.provider === "openrouter") headers["x-title"] = "Kimbo";

  const res = await send(fetchImpl, `${CHAT_BASE[slot.provider]}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body) }, signal);
  if (!res.ok) throw await failure(res);

  const json = (await res.json().catch(() => null)) as {
    model?: string;
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  } | null;
  // OpenRouter can answer 200 with an error object when the upstream free model fails.
  if (json?.error) throw new ProviderError("server", json.error.message ?? "Provider error");
  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new ProviderError("bad_output", "Empty response");
  return {
    text,
    model: json?.model ?? model,
    usage: { inputTokens: json?.usage?.prompt_tokens ?? 0, outputTokens: json?.usage?.completion_tokens ?? 0 },
  };
}

const EXT: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
};

/** Speech → text. Groq: Whisper. Gemini: generateContent with the audio inline. */
export async function transcribe(
  fetchImpl: Fetch,
  slot: AiSlot,
  model: string,
  audio: AudioInput,
  vocabularyHint: string,
  signal: AbortSignal,
): Promise<{ text: string; model: string; usage: Usage }> {
  if (slot.provider === "openrouter") throw new ProviderError("not_found", `No speech-to-text on ${slot.provider}`);

  if (slot.provider === "groq") {
    const form = new FormData();
    const bytes = Buffer.from(audio.base64, "base64");
    form.append("file", new Blob([bytes], { type: audio.mimeType }), `audio.${EXT[audio.mimeType] ?? "m4a"}`);
    form.append("model", model);
    form.append("response_format", "json");
    form.append("temperature", "0");
    // No `language`: English first, but forcing "en" would rule out Hinglish later (IDEATION).
    form.append("prompt", vocabularyHint);
    const res = await send(
      fetchImpl,
      "https://api.groq.com/openai/v1/audio/transcriptions",
      { method: "POST", headers: { authorization: `Bearer ${slot.apiKey}` }, body: form },
      signal,
    );
    if (!res.ok) throw await failure(res);
    const json = (await res.json().catch(() => null)) as { text?: string } | null;
    if (typeof json?.text !== "string") throw new ProviderError("bad_output", "No transcript");
    return { text: json.text.trim(), model, usage: { inputTokens: 0, outputTokens: 0 } };
  }

  // Gemini (native API; the OpenAI-compatible layer has no transcription endpoint).
  const res = await send(
    fetchImpl,
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": slot.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Transcribe this voice note exactly as spoken. Return only the transcript, no quotes or notes. Words you may hear: ${vocabularyHint}`,
              },
              { inline_data: { mime_type: audio.mimeType, data: audio.base64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
    },
    signal,
  );
  if (!res.ok) throw await failure(res);
  const json = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  } | null;
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  if (text === undefined) throw new ProviderError("bad_output", "No transcript");
  return {
    text,
    model,
    usage: { inputTokens: json?.usageMetadata?.promptTokenCount ?? 0, outputTokens: json?.usageMetadata?.candidatesTokenCount ?? 0 },
  };
}
