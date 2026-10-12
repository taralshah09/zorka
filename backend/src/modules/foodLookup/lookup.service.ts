// Food lookup: a voice-logged food that isn't in the catalog (no_match) → one open-web search (Tavily → Firecrawl →
// Anakin, D59) → the AI reads one serving's nutrition from the snippets → the phone pre-fills Create food (S20) and the
// person checks it before saving. Nothing is saved here.
//
// Found results are cached per name for a week; "not found" isn't cached, so the next try searches again. Search or AI
// failing is a 503 the phone shows as "Couldn't look it up" over an empty form.
import { notFound } from "../../http/errors.js";
import type { AiClient } from "../ai/ai.client.js";
import type { SearchClient } from "../nearby/search.client.js";
import { AiLookup, type FoodLookupResult } from "./lookup.schemas.js";
import { LOOKUP_SYSTEM, lookupQuery, lookupUser } from "./prompts.js";

export const LOOKUP_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
export const LOOKUP_CACHE_MAX = 300;
const MAX_RESULTS = 6;

const clean = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const round1 = (n: number) => Math.round(n * 10) / 10;

export function foodLookupService(ai: AiClient, search: SearchClient, userExists: (id: string) => Promise<boolean>, now = Date.now) {
  const cache = new Map<string, { at: number; result: FoodLookupResult }>();

  function remember(key: string, result: FoodLookupResult) {
    if (cache.size >= LOOKUP_CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: now(), result });
  }

  return {
    async lookup(userId: string, name: string): Promise<FoodLookupResult> {
      if (!(await userExists(userId))) throw notFound("User");
      const key = clean(name);
      const cached = cache.get(key);
      if (cached && now() - cached.at < LOOKUP_CACHE_MS) return { ...cached.result, query: name };

      const { hits, provider } = await search.search({ query: lookupQuery(name), maxResults: MAX_RESULTS });
      const miss: FoodLookupResult = { query: name, found: false, food: null, source: null, provider };
      if (!hits.length) return miss;

      const { value: v } = await ai.json({ system: LOOKUP_SYSTEM, user: lookupUser(name, hits), schema: AiLookup });
      const hit = v.hit === null ? undefined : hits[v.hit];
      const grams = v.unit === "g" ? 100 : v.gramsPerServing;
      // Numbers must point at a real result and include calories; anything else is treated as not found.
      if (!v.found || !hit || !grams || !v.kcal) return miss;

      const result: FoodLookupResult = {
        query: name,
        found: true,
        food: {
          name: v.name ?? name,
          diet: v.diet,
          liquid: v.liquid || v.unit === "glass",
          homeCooked: v.homeCooked,
          serving: { unit: v.unit, grams: Math.round(grams) },
          kcal: Math.round(v.kcal),
          proteinG: round1(v.proteinG),
          carbsG: round1(v.carbsG),
          fatG: round1(v.fatG),
        },
        source: { title: hit.title, url: hit.url },
        provider,
      };
      remember(key, result);
      return result;
    },
  };
}

export type FoodLookupService = ReturnType<typeof foodLookupService>;
