// Matching free text ("2 roti", "1 katori rajma") to foods in the database (P12 search, P15 parser).
// Pure and dependency-free (D24). Scoring is simple on purpose: the catalog is a few hundred foods.
import type { FoodUnit } from "./food.js";

/** Lower-case, strip accents and punctuation, collapse spaces. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Very small plural/spelling folding so "rotis", "chapatis", "eggs" find their food. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("es") && !word.endsWith("ses")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

const tokens = (s: string) => normalize(s).split(" ").filter(Boolean).map(stem);

function bigrams(s: string): Set<string> {
  const t = ` ${normalize(s)} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return (2 * shared) / (a.size + b.size);
}

export type Matchable = { name: string; aliases: readonly string[] };

/**
 * 0..1 similarity between a query and a food (best of its name and aliases).
 * 1 = exact (after normalising), ≥ 0.9 = every query word is a whole word of the name,
 * otherwise character-bigram similarity blended with word overlap.
 */
export function matchScore(query: string, food: Matchable): number {
  const q = normalize(query);
  if (!q) return 0;
  const qTokens = tokens(query);
  let best = 0;
  for (const label of [food.name, ...food.aliases]) {
    const l = normalize(label);
    if (!l) continue;
    if (l === q) return 1;
    const lTokens = tokens(label);
    if (lTokens.join(" ") === qTokens.join(" ")) return 1;
    const overlap = qTokens.filter((t) => lTokens.includes(t)).length;
    let score: number;
    if (overlap === qTokens.length) {
      // Every query word appears in the label: strong, a bit lower when the label has extra words.
      score = 0.9 - Math.min(0.2, (lTokens.length - qTokens.length) * 0.05);
    } else {
      const wordShare = overlap / Math.max(qTokens.length, lTokens.length);
      score = 0.6 * dice(bigrams(q), bigrams(l)) + 0.4 * wordShare;
    }
    if (l.startsWith(q)) score = Math.max(score, 0.75);
    best = Math.max(best, score);
  }
  return Math.round(best * 1000) / 1000;
}

/** Below this, a parsed item counts as "no match" (P15: unmatched → "Search instead"). */
export const MIN_MATCH_SCORE = 0.55;

/** Foods ranked by score (best first), dropping anything under `min`. Ties keep catalog order. */
export function rankFoods<T extends Matchable>(query: string, foods: readonly T[], min = 0.35, limit = 25): T[] {
  return foods
    .map((f, i) => ({ f, i, s: matchScore(query, f) }))
    .filter((x) => x.s >= min)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.f);
}

/** The single best food for a parsed item name, with its score, or null under MIN_MATCH_SCORE. */
export function bestMatch<T extends Matchable>(query: string, foods: readonly T[]): { food: T; score: number } | null {
  let best: { food: T; score: number } | null = null;
  for (const food of foods) {
    const score = matchScore(query, food);
    if (!best || score > best.score) best = { food, score };
  }
  return best && best.score >= MIN_MATCH_SCORE ? best : null;
}

// ---------------------------------------------------------------------------------------------------
// Unit words → FoodUnit. The AI step returns free-text units ("katori", "glasses", "half plate").
// ---------------------------------------------------------------------------------------------------

const UNIT_WORDS: Record<string, FoodUnit> = {
  g: "g",
  gm: "g",
  gms: "g",
  gram: "g",
  grams: "g",
  ml: "ml",
  millilitre: "ml",
  milliliter: "ml",
  piece: "piece",
  pieces: "piece",
  pc: "piece",
  pcs: "piece",
  nos: "piece",
  roti: "piece",
  rotis: "piece",
  chapati: "piece",
  chapatis: "piece",
  phulka: "piece",
  phulkas: "piece",
  paratha: "piece",
  parathas: "piece",
  idli: "piece",
  idlis: "piece",
  egg: "piece",
  eggs: "piece",
  katori: "katori",
  katoris: "katori",
  vati: "katori",
  bowl: "bowl",
  bowls: "bowl",
  plate: "plate_full",
  plates: "plate_full",
  "full plate": "plate_full",
  "half plate": "plate_half",
  half: "plate_half",
  glass: "glass",
  glasses: "glass",
  cup: "cup",
  cups: "cup",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  spoon: "tbsp",
  spoons: "tbsp",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  slice: "slice",
  slices: "slice",
  serving: "serving",
  servings: "serving",
  portion: "serving",
};

/** Maps a unit word to a FoodUnit, or null when it isn't one we know (the caller uses the default). */
export function parseUnit(word: string | null | undefined): FoodUnit | null {
  if (!word) return null;
  const n = normalize(word);
  return UNIT_WORDS[n] ?? UNIT_WORDS[n.split(" ").pop() ?? ""] ?? null;
}
