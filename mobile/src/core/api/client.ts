// Typed API client. Base URL comes from EXPO_PUBLIC_API_URL (mobile/.env, see .env.example).
// Every failure becomes an ApiError with a `kind` the UI can map to a state (offline, error, …).

export type ApiErrorKind = "config" | "network" | "timeout" | "http";

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 10_000;

export function apiBaseUrl(): string | null {
  const url = process.env.EXPO_PUBLIC_API_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

type Options = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** Defaults to 10 s. AI parsing (P15–P17) waits longer because the server may try several keys. */
  timeoutMs?: number;
};

export async function api<T>(
  path: string,
  { method = "GET", body, signal, timeoutMs = TIMEOUT_MS }: Options = {},
): Promise<T> {
  const base = apiBaseUrl();
  if (!base) throw new ApiError("config", "API URL isn't set. Add EXPO_PUBLIC_API_URL to mobile/.env.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  signal?.addEventListener("abort", () => controller.abort());

  let res: Response;
  try {
    res = await fetch(`${base}/v1${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw controller.signal.aborted && !signal?.aborted
      ? new ApiError("timeout", "The server took too long to answer.")
      : new ApiError("network", "Can't reach the server.");
  } finally {
    clearTimeout(timer);
  }

  const json = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (!res.ok) {
    throw new ApiError("http", json?.error?.message ?? `Request failed (${res.status})`, res.status, json?.error?.code);
  }
  return json as T;
}

/** Plain-language copy for an error, for ErrorState / toasts. */
export function describeError(err: unknown): { title: string; body: string } {
  if (err instanceof ApiError) {
    switch (err.kind) {
      case "config":
        return { title: "App isn't configured", body: err.message };
      case "network":
        return { title: "Can't reach Kimbo", body: "Check your connection and try again." };
      case "timeout":
        return { title: "That took too long", body: "The server is slow right now. Try again." };
      case "http":
        // AI errors (P14) carry plain-language messages from the server.
        if (err.code === "RATE_LIMITED") return { title: "AI is busy right now", body: err.message };
        if (err.code === "AI_UNAVAILABLE") return { title: "Can't read meals right now", body: err.message };
        if (err.code === "AI_TIMEOUT") return { title: "That took too long", body: err.message };
        if (err.code === "PAYLOAD_TOO_LARGE")
          return { title: "That's too big to send", body: "Try a shorter voice note or another photo." };
        return { title: "Something went wrong", body: err.message };
    }
  }
  return { title: "Something went wrong", body: "Please try again." };
}
