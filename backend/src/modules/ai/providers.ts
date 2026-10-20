// P14 · Raw provider calls over fetch (no SDKs, D30). Groq, Gemini and OpenRouter all expose an
// OpenAI-compatible /chat/completions (with tool calling, D100); speech-to-text uses Sarvam (D100), Groq's Whisper
// endpoint or Gemini's native generateContent with inline audio. Every failure becomes a ProviderError with a `kind` the chain
// uses to decide how long the slot sits out.
import { sttConfidence, type Confidence, type SttSegment } from "../../../../shared/domain/assistant.js";
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

const CHAT_BASE: Partial<Record<AiSlot["provider"], string>> = {
  groq: "https://api.groq.com/openai/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  openrouter: "https://openrouter.ai/api/v1",
};

function chatUrl(slot: AiSlot): string {
  const base = CHAT_BASE[slot.provider];
  if (!base) throw new ProviderError("not_found", `No chat on ${slot.provider}`);
  return `${base}/chat/completions`;
}

function chatHeaders(slot: AiSlot): Record<string, string> {
  const headers: Record<string, string> = { authorization: `Bearer ${slot.apiKey}`, "content-type": "application/json" };
  if (slot.provider === "openrouter") headers["x-title"] = "Zorka";
  return headers;
}

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
function reasoningParams(slot: AiSlot, model: string, effort: "low" | "medium" = "low"): Record<string, unknown> {
  if (slot.provider === "groq" && model.startsWith("openai/gpt-oss")) return { reasoning_effort: effort };
  if (slot.provider === "groq" && model.startsWith("qwen/")) return { reasoning_format: "hidden" };
  if (slot.provider === "gemini" && /^gemini-3/.test(model)) return { reasoning_effort: effort };
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

  const res = await send(fetchImpl, chatUrl(slot), { method: "POST", headers: chatHeaders(slot), body: JSON.stringify(body) }, signal);
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

// ── Tool calling (D100) ──────────────────────────────────────────────────────────────────────────

/** A function the model may call: JSON Schema parameters in the OpenAI shape every provider here accepts. */
export type ToolSpec = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };
export type ToolCall = { id: string; name: string; arguments: string };
/**
 * One message of a tool-calling conversation. The assistant's reply goes back exactly as it came (Gemini 3 needs its
 * thought signature on the tool calls returned with them).
 */
export type AgentMessage =
  | { role: "system" | "user"; content: string }
  | { role: "tool"; tool_call_id: string; content: string }
  | ({ role: "assistant" } & Record<string, unknown>);

/** One tool-calling turn with `model`: the assistant's message, its text and the tools it called. */
export async function chatTools(
  fetchImpl: Fetch,
  slot: AiSlot,
  model: string,
  req: { messages: AgentMessage[]; tools: ToolSpec[]; maxTokens?: number },
  signal: AbortSignal,
): Promise<{ message: AgentMessage; content: string; toolCalls: ToolCall[]; model: string; usage: Usage }> {
  const body = {
    model,
    temperature: 0.1,
    max_tokens: req.maxTokens ?? 2048,
    // Picking every action a sentence asks for (and its reason's day) needs more thought than low effort gives (D100).
    ...reasoningParams(slot, model, "medium"),
    messages: req.messages,
    tools: req.tools,
    tool_choice: "auto",
  };
  const res = await send(fetchImpl, chatUrl(slot), { method: "POST", headers: chatHeaders(slot), body: JSON.stringify(body) }, signal);
  if (!res.ok) throw await failure(res);
  const json = (await res.json().catch(() => null)) as {
    model?: string;
    choices?: { message?: Record<string, unknown> & { content?: string | null; tool_calls?: unknown } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  } | null;
  if (json?.error) throw new ProviderError("server", json.error.message ?? "Provider error");
  const message = json?.choices?.[0]?.message;
  if (!message) throw new ProviderError("bad_output", "No message");
  const raw = Array.isArray(message.tool_calls) ? (message.tool_calls as { id?: unknown; function?: { name?: unknown; arguments?: unknown } }[]) : [];
  const toolCalls: ToolCall[] = raw.map((c, i) => ({
    id: typeof c.id === "string" && c.id ? c.id : `call_${i}`,
    name: typeof c.function?.name === "string" ? c.function.name : "",
    arguments: typeof c.function?.arguments === "string" ? c.function.arguments : JSON.stringify(c.function?.arguments ?? {}),
  }));
  // Ids are made up when a provider leaves them out, so the tool results always point at a call.
  const echoed = { ...message, role: "assistant" as const, content: message.content ?? null };
  if (raw.length) echoed.tool_calls = raw.map((c, i) => ({ ...c, id: toolCalls[i]!.id }));
  return {
    message: echoed,
    content: typeof message.content === "string" ? message.content : "",
    toolCalls,
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

/**
 * Speech → text. Groq: Whisper. Gemini: generateContent with the audio inline. AB6: Whisper answers in `verbose_json`,
 * so each transcript comes with a confidence from its segment scores; Gemini has none and reads as "medium" (D93).
 */
export async function transcribe(
  fetchImpl: Fetch,
  slot: AiSlot,
  model: string,
  audio: AudioInput,
  vocabularyHint: string,
  signal: AbortSignal,
): Promise<{ text: string; model: string; usage: Usage; confidence: Confidence }> {
  if (slot.provider === "openrouter") throw new ProviderError("not_found", `No speech-to-text on ${slot.provider}`);

  // D100 · Sarvam: `translit` writes Hindi and Hinglish in Roman letters ("do katori poha"), the script everything
  // after speech-to-text reads. No word scores, so the transcript is "medium" like Gemini's (D93).
  if (slot.provider === "sarvam") {
    const form = new FormData();
    const bytes = Buffer.from(audio.base64, "base64");
    form.append("file", new Blob([bytes], { type: audio.mimeType }), `audio.${EXT[audio.mimeType] ?? "m4a"}`);
    form.append("model", model);
    form.append("mode", "translit");
    form.append("language_code", "unknown");
    const res = await send(
      fetchImpl,
      "https://api.sarvam.ai/speech-to-text",
      { method: "POST", headers: { "api-subscription-key": slot.apiKey }, body: form },
      signal,
    );
    if (!res.ok) throw await failure(res);
    const json = (await res.json().catch(() => null)) as { transcript?: string } | null;
    if (typeof json?.transcript !== "string") throw new ProviderError("bad_output", "No transcript");
    return { text: json.transcript.trim(), model, usage: { inputTokens: 0, outputTokens: 0 }, confidence: "medium" };
  }

  if (slot.provider === "groq") {
    const form = new FormData();
    const bytes = Buffer.from(audio.base64, "base64");
    form.append("file", new Blob([bytes], { type: audio.mimeType }), `audio.${EXT[audio.mimeType] ?? "m4a"}`);
    form.append("model", model);
    form.append("response_format", "verbose_json");
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
    const json = (await res.json().catch(() => null)) as { text?: string; segments?: SttSegment[] } | null;
    if (typeof json?.text !== "string") throw new ProviderError("bad_output", "No transcript");
    const segments = Array.isArray(json.segments) ? json.segments : null;
    return { text: json.text.trim(), model, usage: { inputTokens: 0, outputTokens: 0 }, confidence: sttConfidence(segments) };
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
                text: `Transcribe this voice note exactly as spoken. Write Hindi or Hinglish in Roman letters ("do katori poha"), never Devanagari. Return only the transcript, no quotes or notes. Words you may hear: ${vocabularyHint}`,
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
    confidence: "medium",
  };
}
