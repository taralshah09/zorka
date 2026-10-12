// P34 · Web search with fallback across services (D59): Tavily → Firecrawl → Anakin by default.
//
// Only search-engine results (title, snippet, URL) are used; Zomato and Blinkit pages are never fetched. Rate limits cool a
// service down for 10 min, bad keys for 1 h, outages and timeouts for 1 min, like the AI slots (D30). Keys are never
// logged; provider error bodies are cut short.
import type { Logger } from "pino";

import { AppError } from "../../http/errors.js";

export type SearchProvider = "tavily" | "firecrawl" | "anakin";
export type SearchHit = { title: string; url: string; snippet: string };
/** `domain` limits results to one site (nearby); without it the whole web is searched (food lookup). */
export type SearchRequest = { query: string; domain?: string; maxResults: number };
type Fetch = typeof globalThis.fetch;

export const SEARCH_TIMEOUT_MS = 8_000;
const COOLDOWN = { rate_limit: 10 * 60_000, auth: 60 * 60_000, transient: 60_000 } as const;

type FailureKind = "rate_limit" | "auth" | "transient" | "bad_output";
class SearchError extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string,
  ) {
    super(message);
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

async function post(fetchImpl: Fetch, url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal) {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...headers },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new SearchError("transient", signal.aborted ? "Timed out" : "Network error");
  }
  if (res.status === 429 || res.status === 402) throw new SearchError("rate_limit", `HTTP ${res.status}`);
  if (res.status === 401 || res.status === 403) throw new SearchError("auth", `HTTP ${res.status}`);
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 200);
    throw new SearchError("transient", `HTTP ${res.status} ${text}`);
  }
  return (await res.json().catch(() => {
    throw new SearchError("bad_output", "Reply was not JSON");
  })) as Record<string, unknown>;
}

const toHits = (rows: unknown, snippetKey: string): SearchHit[] =>
  (Array.isArray(rows) ? rows : [])
    .map((r: Record<string, unknown>) => ({ title: str(r.title), url: str(r.url), snippet: str(r[snippetKey]) }))
    .filter((h) => h.url && (h.title || h.snippet));

const ADAPTERS: Record<SearchProvider, (key: string, req: SearchRequest, f: Fetch, s: AbortSignal) => Promise<SearchHit[]>> = {
  async tavily(key, req, f, signal) {
    const json = await post(
      f,
      "https://api.tavily.com/search",
      { authorization: `Bearer ${key}` },
      {
        query: req.query,
        search_depth: "basic",
        max_results: req.maxResults,
        country: "india",
        ...(req.domain ? { include_domains: [req.domain] } : {}),
      },
      signal,
    );
    return toHits(json.results, "content");
  },
  async firecrawl(key, req, f, signal) {
    const json = await post(
      f,
      "https://api.firecrawl.dev/v2/search",
      { authorization: `Bearer ${key}` },
      { query: req.query, limit: req.maxResults, sources: ["web"], country: "IN", ...(req.domain ? { includeDomains: [req.domain] } : {}) },
      signal,
    );
    const data = json.data as { web?: unknown } | unknown[] | undefined;
    return toHits(Array.isArray(data) ? data : data?.web, "description");
  },
  async anakin(key, req, f, signal) {
    // Anakin's search takes a prompt and has no domain filter, so the domain goes into the prompt and is checked below.
    const prompt = req.domain ? `${req.query} site:${req.domain}` : req.query;
    const json = await post(f, "https://api.anakin.io/v1/search", { "x-api-key": key }, { prompt }, signal);
    return toHits(json.results, "snippet");
  },
};

/** True when `url` is on `domain` or a subdomain of it. */
export function onDomain(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

export type SearchStatus = { configured: SearchProvider[]; coolingDown: SearchProvider[] };

export interface SearchClient {
  /** Hits (on `req.domain` when given) from the first service that answers. Throws SEARCH_UNAVAILABLE when none can. */
  search(req: SearchRequest): Promise<{ hits: SearchHit[]; provider: SearchProvider }>;
  status(): SearchStatus;
}

export function createSearchClient({
  keys,
  order,
  logger,
  fetchImpl = globalThis.fetch,
  now = Date.now,
}: {
  keys: Partial<Record<SearchProvider, string | undefined>>;
  order: readonly SearchProvider[];
  logger: Logger;
  fetchImpl?: Fetch;
  now?: () => number;
}): SearchClient {
  const providers = order.filter((p) => !!keys[p]?.trim());
  const cooldownUntil = new Map<SearchProvider, number>();

  return {
    async search(req) {
      if (!providers.length) {
        throw new AppError("SEARCH_UNAVAILABLE", "Nearby search isn't set up on the server.", { reason: "not_configured" });
      }
      for (const provider of providers) {
        if ((cooldownUntil.get(provider) ?? 0) > now()) continue;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
        const t0 = now();
        try {
          const hits = (await ADAPTERS[provider](keys[provider]!.trim(), req, fetchImpl, controller.signal))
            .filter((h) => !req.domain || onDomain(h.url, req.domain))
            .slice(0, req.maxResults);
          logger.info({ search: { provider, domain: req.domain ?? "web", hits: hits.length, ms: now() - t0, outcome: "ok" } }, "search");
          return { hits, provider };
        } catch (raw) {
          const err = raw instanceof SearchError ? raw : new SearchError("bad_output", raw instanceof Error ? raw.message : "Unexpected");
          logger.warn({ search: { provider, domain: req.domain ?? "web", ms: now() - t0, outcome: err.kind }, detail: err.message.slice(0, 200) }, "search failed, trying next");
          const cool = err.kind === "bad_output" ? 0 : COOLDOWN[err.kind];
          if (cool) cooldownUntil.set(provider, now() + cool);
        } finally {
          clearTimeout(timer);
        }
      }
      throw new AppError("SEARCH_UNAVAILABLE", "Couldn't search nearby right now.", { reason: "all_failed" });
    },
    status: () => ({ configured: providers, coolingDown: providers.filter((p) => (cooldownUntil.get(p) ?? 0) > now()) }),
  };
}
