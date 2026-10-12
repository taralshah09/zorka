// Prompt for reading a food's nutrition out of web search snippets. Kept short for free-tier limits.
import type { SearchHit } from "../nearby/search.client.js";

export const LOOKUP_SYSTEM = `You read web search results about one food or drink eaten in India and pull out its nutrition. Return JSON only.
Rules:
- Use only numbers stated in the results. Never invent them. "hit" is the number of the result they came from.
- If no result gives calories for this food, return {"found":false}.
- Pick one everyday serving: "piece", "katori" (~150 g), "bowl" (~250 g), "plate_full", "glass" (~250 ml), "serving", or "g" (per 100 g).
  Prefer the result's own serving; use "g" when the result only gives per-100 g values.
- "gramsPerServing": grams (ml for drinks) in that one serving; 100 for "g".
- kcal, proteinG, carbsG, fatG are for that one serving. Scale per-100 g numbers to the serving when needed.
- "diet": "jain", "veg", "eggetarian" or "non_veg" (strictest that fits a typical recipe), or null if unsure.
- "liquid": true for drinks. "homeCooked": true for dishes usually made at home, false for packaged or restaurant items.
{"found":true,"hit":0,"name":"Sabudana khichdi","diet":"veg","liquid":false,"homeCooked":true,"unit":"katori","gramsPerServing":150,"kcal":290,"proteinG":4.5,"carbsG":48,"fatG":9}`;

export const lookupQuery = (name: string) => `${name} nutrition facts calories protein carbs fat per serving`;

export function lookupUser(name: string, hits: readonly SearchHit[]): string {
  const lines = hits.map((h, i) => `[${i}] ${h.title.slice(0, 120)} — ${h.snippet.replace(/\s+/g, " ").slice(0, 500)}`);
  return `Food: ${name}\nResults:\n${lines.join("\n")}`;
}
