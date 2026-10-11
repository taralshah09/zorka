// P34 · Prompt for turning search snippets into dishes with estimated macros (D59). Kept short for free-tier limits.
import type { SearchHit } from "./search.client.js";

export const NEARBY_SYSTEM = `You read web search results from Zomato (restaurants) and Blinkit (grocery delivery) in India and pick
concrete dishes or products a person could order to close a protein gap. Return JSON only.
Rules:
- Use only items named in the results. Never invent restaurants or products. "hit" is the number of the result it came from.
- One serving per item: a restaurant portion, or one pack / one bottle for Blinkit.
- Estimate kcal, proteinG, carbsG, fatG for that serving from typical Indian recipes and pack labels. Round sensibly.
- "diet": "jain", "veg", "eggetarian" or "non_veg" (strictest that fits a typical recipe), or null if unsure.
- "junk": true for desserts, sweets, sugary drinks, fried snacks, pizza, burgers, fries, alcohol.
- Prefer high-protein, balanced items. Up to 8 items. If nothing fits, return {"dishes":[]}.
{"dishes":[{"hit":0,"name":"Tandoori soya chaap","restaurant":"Punjabi Tadka","kcal":420,"proteinG":28,"carbsG":30,"fatG":18,"diet":"veg","junk":false}]}`;

export function nearbyUser(diet: string, results: { source: string; hit: SearchHit }[]): string {
  const lines = results.map(
    (r, i) => `[${i}] (${r.source}) ${r.hit.title.slice(0, 120)} — ${r.hit.snippet.replace(/\s+/g, " ").slice(0, 300)}`,
  );
  return `Diet: ${diet}\nResults:\n${lines.join("\n")}`;
}

const DIET_WORD: Record<string, string> = { jain: "jain veg", veg: "veg", eggetarian: "egg veg", non_veg: "chicken egg" };

export function zomatoQuery(areaLabel: string, diet: string): string {
  return `high protein ${DIET_WORD[diet] ?? ""} dishes delivery ${areaLabel} zomato`.replace(/\s+/g, " ").trim();
}

export function blinkitQuery(areaLabel: string, diet: string): string {
  const items = diet === "non_veg" || diet === "eggetarian" ? "greek yogurt protein shake eggs" : "greek yogurt protein shake paneer";
  return `${items} blinkit ${areaLabel}`.replace(/\s+/g, " ").trim();
}
