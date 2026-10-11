// P32 · Ranking "Eat" options for the Gap Closer (D56). Pure domain logic shared by mobile and backend (D24).
// Callers gather candidates (past meals, home foods, nearby dishes) and pass them in with today's gap.
//
// Constants are the ones accepted at the P32 gate (docs/DECISIONS.md D56). Changing any of them is a product decision.
import type { Diet, MealType } from "./food.js";
import type { GapMacros } from "./gap.js";

export type EatSource = "usual" | "home" | "zomato" | "blinkit";

export type EatCandidate = {
  id: string;
  name: string;
  source: EatSource;
  /** Macros for the suggested portion. */
  macros: GapMacros;
  /** null = unknown (nearby dishes without a tag are dropped for strict diets). */
  diet: Diet | null;
  /** Food category (food.ts / API `FoodCategory`), null when unknown. */
  category: string | null;
  cuisine: string | null;
  /** Meal slots this has been eaten in (usual), empty when there's no history. */
  mealTypes: readonly MealType[];
  /** Times logged in the last 30 days. */
  timesLogged: number;
  /** Macros are an AI estimate (nearby). */
  estimate: boolean;
};

export type RankContext = {
  remaining: GapMacros;
  /** Today's kcal budget (for the size of a mid-day option). */
  budgetKcal: number;
  focus: "protein" | "kcal" | null;
  diet: Diet;
  mealType: MealType;
  /** Share of the user's logged items per cuisine, 0–1. */
  cuisineShare: Readonly<Record<string, number>>;
};

export const WEIGHTS = {
  macroFit: 0.45,
  frequency: 0.2,
  timeFit: 0.2,
  cuisine: 0.15,
} as const;
/** An option may use at most this much more than the kcal left. */
export const MAX_KCAL_OVERSHOOT = 0.1;
/** Before dinner, an option is sized like a meal: at most this share of the day's budget. */
export const MEAL_SHARE_OF_BUDGET = 0.35;
export const FREQUENCY_SATURATION = 10;
export const MAX_PER_GROUP = 2;
export const MIN_OPTIONS = 3;
export const MAX_OPTIONS = 5;
/** Fried snack: more than this share of kcal from fat. */
export const FRIED_FAT_SHARE = 0.45;
/** Fats and condiments (butter, ghee, oil): not a meal. */
export const PURE_FAT_SHARE = 0.85;

const DIET_LADDER: readonly Diet[] = ["jain", "veg", "eggetarian", "non_veg"];
const dietFits = (pref: Diet, food: Diet) =>
  DIET_LADDER.indexOf(food) <= DIET_LADDER.indexOf(pref);

/** The S41 Veg ↔ Non-veg switch, from the profile's diet. Veg keeps Jain; Non-veg keeps eggetarian/non-veg. */
export function dietForSwitch(profile: Diet, choice: "veg" | "non_veg"): Diet {
  if (choice === "veg") return profile === "jain" ? "jain" : "veg";
  return profile === "eggetarian" || profile === "non_veg"
    ? profile
    : "non_veg";
}
/** Which side of the switch the profile's diet starts on. */
export const switchSideFor = (profile: Diet): "veg" | "non_veg" =>
  profile === "jain" || profile === "veg" ? "veg" : "non_veg";

const JUNK_NAME =
  /\b(pizza|burger|fries|cake|pastry|ice ?cream|sundae|donut|doughnut|brownie|cookie|waffle|chips|crisps|cola|soft drink|soda|energy drink|jalebi|gulab jamun|rasgulla|mithai|candy|chocolate bar|milkshake|beer|wine|whisky|vodka|rum|cocktail)\b/i;
const PROTEIN_WORDS = /\b(protein|whey)\b/i;

/** Junk never gets suggested just to hit a number (D56). */
export function isJunk(c: {
  name: string;
  category: string | null;
  macros: GapMacros;
}): boolean {
  const { kcal, proteinG, carbsG, fatG } = c.macros;
  if (c.category === "sweet") return true;
  if (JUNK_NAME.test(c.name) && !PROTEIN_WORDS.test(c.name)) return true;
  if (kcal <= 0) return false;
  const fatShare = (fatG * 9) / kcal;
  const carbShare = (carbsG * 4) / kcal;
  const proteinShare = (proteinG * 4) / kcal;
  if (fatShare > PURE_FAT_SHARE) return true;
  if (c.category === "snack" && fatShare > FRIED_FAT_SHARE) return true;
  if (c.category === "drink" && carbShare >= 0.6 && proteinShare < 0.15)
    return true;
  return false;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** The kcal an option should aim for: everything that's left at dinner, a meal-sized share before that. */
export function targetKcal(
  ctx: Pick<RankContext, "remaining" | "budgetKcal" | "mealType">,
): number {
  const left = Math.max(0, ctx.remaining.kcal);
  return ctx.mealType === "dinner"
    ? left
    : Math.min(left, ctx.budgetKcal * MEAL_SHARE_OF_BUDGET);
}

/** 0–1: how well these macros close the gap (protein first when protein is the focus, then kcal). */
export function macroFit(m: GapMacros, ctx: RankContext): number {
  const T = targetKcal(ctx);
  const kf = T > 0 ? clamp01(1 - Math.abs(T - m.kcal) / T) : 0;
  const P = ctx.remaining.proteinG;
  if (P <= 0) return kf;
  const pf = clamp01(m.proteinG / P);
  return ctx.focus === "kcal" ? 0.35 * pf + 0.65 * kf : 0.65 * pf + 0.35 * kf;
}

const frequencyScore = (n: number) =>
  clamp01(Math.log2(1 + Math.max(0, n)) / Math.log2(1 + FREQUENCY_SATURATION));

function timeFit(c: EatCandidate, mealType: MealType): number {
  if (c.mealTypes.length) return c.mealTypes.includes(mealType) ? 1 : 0.2;
  if (c.source === "zomato" || c.source === "blinkit")
    return mealType === "lunch" || mealType === "dinner" ? 1 : 0.5;
  return 0.5;
}

export function scoreCandidate(c: EatCandidate, ctx: RankContext): number {
  const cuisine = c.cuisine ? (ctx.cuisineShare[c.cuisine] ?? 0) : 0.3;
  return (
    WEIGHTS.macroFit * macroFit(c.macros, ctx) +
    WEIGHTS.frequency * frequencyScore(c.timesLogged) +
    WEIGHTS.timeFit * timeFit(c, ctx.mealType) +
    WEIGHTS.cuisine * clamp01(cuisine)
  );
}

/** Why a candidate is never shown: diet, junk, or too big for what's left. null = allowed. */
export function excluded(
  c: EatCandidate,
  ctx: RankContext,
): "diet" | "junk" | "too_big" | "nothing_left" | null {
  if (ctx.remaining.kcal <= 0) return "nothing_left";
  if (!c.diet ? ctx.diet !== "non_veg" : !dietFits(ctx.diet, c.diet))
    return "diet";
  if (isJunk(c)) return "junk";
  if (c.macros.kcal > ctx.remaining.kcal * (1 + MAX_KCAL_OVERSHOOT))
    return "too_big";
  return null;
}

export type RankedOption = EatCandidate & { score: number };

/**
 * 3–5 options (fewer only when fewer are allowed): up to MAX_PER_GROUP from each of Your usual, Home and nearby,
 * best first; empty slots are filled from what's left. Nothing is suggested while over (remaining kcal ≤ 0).
 */
export function rankEatOptions(
  candidates: readonly EatCandidate[],
  ctx: RankContext,
): RankedOption[] {
  const seen = new Set<string>();
  const allowed: RankedOption[] = [];
  for (const c of candidates) {
    const key = c.name.trim().toLowerCase();
    if (seen.has(key) || excluded(c, ctx)) continue;
    seen.add(key);
    allowed.push({ ...c, score: scoreCandidate(c, ctx) });
  }
  allowed.sort((a, b) => b.score - a.score);

  const group = (s: EatSource) =>
    s === "zomato" || s === "blinkit" ? "nearby" : s;
  const taken = new Map<string, number>();
  const picked: RankedOption[] = [];
  const rest: RankedOption[] = [];
  for (const o of allowed) {
    const g = group(o.source);
    const n = taken.get(g) ?? 0;
    if (n < MAX_PER_GROUP && picked.length < MAX_OPTIONS) {
      picked.push(o);
      taken.set(g, n + 1);
    } else rest.push(o);
  }
  for (const o of rest) {
    if (picked.length >= MIN_OPTIONS) break;
    picked.push(o);
  }
  return picked.sort((a, b) => b.score - a.score);
}

/** The portion of a home food that best closes the gap without going too big; null when none fits. */
export function bestPortion<P extends { macros: GapMacros }>(
  portions: readonly P[],
  ctx: RankContext,
): P | null {
  let best: { p: P; fit: number } | null = null;
  for (const p of portions) {
    if (
      p.macros.kcal <= 0 ||
      p.macros.kcal > ctx.remaining.kcal * (1 + MAX_KCAL_OVERSHOOT)
    )
      continue;
    const fit = macroFit(p.macros, ctx);
    if (!best || fit > best.fit) best = { p, fit };
  }
  return best?.p ?? null;
}
