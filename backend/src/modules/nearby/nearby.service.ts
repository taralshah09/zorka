// P34 · Nearby Zomato/Blinkit options (D59): two searches (zomato.com, blinkit.com) for the area → the AI picks dishes
// and estimates macros from the snippets → junk and unsafe links are dropped → cached for 12 h per area and diet.
//
// Degrades instead of failing where it can: one search failing still returns the other's options (`partial`); both
// failing, or the AI failing, is a 503 the phone shows as "Couldn't load nearby options" next to the other options.
import { isJunk } from "../../../../shared/domain/eatOptions.js";
import { AppError, notFound } from "../../http/errors.js";
import { stableUuid } from "../../lib/stableId.js";
import type { AiClient } from "../ai/ai.client.js";
import { AiNearby, type NearbyArea, type NearbyOption, type NearbyResult, type NearbySource } from "./nearby.schemas.js";
import { NEARBY_SYSTEM, blinkitQuery, nearbyUser, zomatoQuery } from "./prompts.js";
import { onDomain, type SearchClient, type SearchHit } from "./search.client.js";

export const NEARBY_CACHE_MS = 12 * 60 * 60 * 1000;
export const NEARBY_CACHE_MAX = 200;
const MAX_RESULTS = 6;
const DOMAIN: Record<NearbySource, string> = { zomato: "zomato.com", blinkit: "blinkit.com" };

const clean = (s: string | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Cache key and the words used in the query: the pincode when given, else locality + city. */
export function areaOf(area: NearbyArea): { key: string; label: string } {
  if (area.pincode) return { key: `pin:${area.pincode}`, label: area.pincode };
  const parts = [area.locality, area.city].map((p) => p?.trim()).filter((p): p is string => !!p);
  return { key: `loc:${parts.map(clean).join("|")}`, label: parts.join(" ") };
}

/** Blinkit links are a search for the item (D59); Zomato links are the result's own page. */
export const blinkitUrl = (name: string) => `https://blinkit.com/s/?q=${encodeURIComponent(name)}`;

const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function nearbyService(ai: AiClient, search: SearchClient, userExists: (id: string) => Promise<boolean>, now = Date.now) {
  const cache = new Map<string, NearbyResult>();

  function remember(key: string, result: NearbyResult) {
    if (cache.size >= NEARBY_CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
  }

  return {
    async nearby(userId: string, area: NearbyArea, diet: string): Promise<NearbyResult> {
      if (!(await userExists(userId))) throw notFound("User");
      const { key: areaKey, label } = areaOf(area);
      const cacheKey = `${areaKey}|${diet}`;
      const cached = cache.get(cacheKey);
      if (cached && Date.parse(cached.expiresAt) > now()) return cached;

      const searches = await Promise.allSettled([
        search.search({ query: zomatoQuery(label, diet), domain: DOMAIN.zomato, maxResults: MAX_RESULTS }),
        search.search({ query: blinkitQuery(label, diet), domain: DOMAIN.blinkit, maxResults: MAX_RESULTS }),
      ]);
      const sources: NearbySource[] = ["zomato", "blinkit"];
      const ok = searches.flatMap((s, i) => (s.status === "fulfilled" ? [{ source: sources[i]!, ...s.value }] : []));
      if (!ok.length) {
        const first = searches[0];
        throw first?.status === "rejected" && first.reason instanceof AppError
          ? first.reason
          : new AppError("SEARCH_UNAVAILABLE", "Couldn't search nearby right now.");
      }

      const results: { source: NearbySource; hit: SearchHit }[] = ok.flatMap((s) => s.hits.map((hit) => ({ source: s.source, hit })));
      const options: NearbyOption[] = [];
      if (results.length) {
        const { value } = await ai.json({ system: NEARBY_SYSTEM, user: nearbyUser(diet, results), schema: AiNearby });
        const seen = new Set<string>();
        for (const d of value.dishes) {
          const r = results[d.hit];
          if (!r || d.junk) continue;
          const macros = { kcal: round(d.kcal), proteinG: round1(d.proteinG), carbsG: round1(d.carbsG), fatG: round1(d.fatG) };
          const category = r.source === "blinkit" ? null : "restaurant";
          if (!macros.kcal || isJunk({ name: d.name, category, macros })) continue;
          const url = r.source === "blinkit" ? blinkitUrl(d.name) : r.hit.url;
          if (!onDomain(url, DOMAIN[r.source])) continue;
          const dedupe = `${r.source}|${clean(d.name)}|${clean(d.restaurant ?? "")}`;
          if (seen.has(dedupe)) continue;
          seen.add(dedupe);
          options.push({
            id: stableUuid(`nearby|${areaKey}|${dedupe}`),
            source: r.source,
            name: d.name,
            restaurant: d.restaurant?.trim() || null,
            url,
            macros,
            diet: d.diet,
            estimate: true,
          });
        }
      }

      const fetchedAt = now();
      const result: NearbyResult = {
        areaKey,
        fetchedAt: new Date(fetchedAt).toISOString(),
        expiresAt: new Date(fetchedAt + NEARBY_CACHE_MS).toISOString(),
        options,
        providers: ok.map((s) => s.provider),
        partial: ok.length < searches.length,
      };
      // A partial answer isn't cached, so the missing source is tried again next time.
      if (!result.partial) remember(cacheKey, result);
      return result;
    },
  };
}

export type NearbyService = ReturnType<typeof nearbyService>;
