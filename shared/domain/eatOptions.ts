// P32 · Ranking "Eat" options for the Gap Closer (D56). Pure domain logic shared by mobile and backend (D24).
// Callers gather candidates (past meals, home foods, nearby dishes) and pass them in with today's gap.
//
// Constants are the ones accepted at the P32 gate (docs/DECISIONS.md D56). Changing any of them is a product decision.
// LA3 (docs/LIFE_PLAN.md "options.ts") adds access, kitchen and budget filters, a protein-per-rupee term for a tight
// budget, the PROTEIN_STAPLES seed and `achievableProteinG`; those constants are proposals at the domain-core gate.
import type { Diet, MealType } from "./food.js";
import type { GapMacros } from "./gap.js";
import type { BudgetBand, DayFacts, MealAccess, MealSource, Standing } from "./life.js";

export type EatSource = "usual" | "home" | "zomato" | "blinkit" | "menu";

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
  /** Where you can get it ("mess", "home", "packed", …). Missing = unknown, never filtered out. */
  access?: readonly MealAccess[];
  needsKitchen?: boolean;
  /** Survives a bag for 6 h without a fridge. */
  portable?: boolean;
  /** Rough estimate, shown as "≈ ₹". */
  costInrPerServing?: number;
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
  /** LA3: the slot's meal access from the brief; missing or "unknown" filters nothing. */
  access?: MealAccess;
  /** LA3: false drops `needsKitchen` items. */
  hasKitchen?: boolean | null;
  /** LA3: "tight" drops items over TIGHT_MAX_INR_PER_SERVING and ranks by protein per rupee. */
  budget?: BudgetBand | null;
};

export const WEIGHTS = {
  macroFit: 0.45,
  frequency: 0.2,
  timeFit: 0.2,
  cuisine: 0.15,
  /** Added on top only when the budget is tight (LA3). */
  cost: 0.2,
} as const;
/** Tight budget: nothing above this per serving is suggested (estimate). */
export const TIGHT_MAX_INR_PER_SERVING = 40;
/** Protein per rupee that scores full marks on the cost term (soya chunks are about 1.5 g/₹). */
export const PROTEIN_PER_INR_SATURATION = 1.5;
/** Cost term for an item with no price: neither rewarded nor punished much. */
export const UNKNOWN_COST_SCORE = 0.5;
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

/** 0–1: protein per rupee against PROTEIN_PER_INR_SATURATION; UNKNOWN_COST_SCORE without a price. */
export function costScore(c: Pick<EatCandidate, "macros" | "costInrPerServing">): number {
  const cost = c.costInrPerServing;
  if (cost == null || !Number.isFinite(cost)) return UNKNOWN_COST_SCORE;
  if (cost <= 0) return 1;
  return clamp01(c.macros.proteinG / cost / PROTEIN_PER_INR_SATURATION);
}

export function scoreCandidate(c: EatCandidate, ctx: RankContext): number {
  const cuisine = c.cuisine ? (ctx.cuisineShare[c.cuisine] ?? 0) : 0.3;
  return (
    WEIGHTS.macroFit * macroFit(c.macros, ctx) +
    WEIGHTS.frequency * frequencyScore(c.timesLogged) +
    WEIGHTS.timeFit * timeFit(c, ctx.mealType) +
    WEIGHTS.cuisine * clamp01(cuisine) +
    (ctx.budget === "tight" ? WEIGHTS.cost * costScore(c) : 0)
  );
}

/** Why a candidate is never shown: diet, access, kitchen, cost, junk, or too big for what's left. null = allowed. */
export function excluded(
  c: EatCandidate,
  ctx: RankContext,
): "diet" | "access" | "kitchen" | "cost" | "junk" | "too_big" | "nothing_left" | null {
  if (ctx.remaining.kcal <= 0) return "nothing_left";
  if (!c.diet ? ctx.diet !== "non_veg" : !dietFits(ctx.diet, c.diet))
    return "diet";
  if (ctx.access && ctx.access !== "unknown" && c.access && !c.access.includes(ctx.access)) return "access";
  if (ctx.hasKitchen === false && c.needsKitchen) return "kitchen";
  if (ctx.budget === "tight" && c.costInrPerServing != null && c.costInrPerServing > TIGHT_MAX_INR_PER_SERVING)
    return "cost";
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

// ── LA3 · Protein staples and realistic protein (docs/LIFE_PLAN.md "options.ts") ──────────────────────────────────

export type ProteinStaple = {
  id: string;
  name: string;
  /** Strictest diet it fits (DIET_LADDER: a "jain" item fits everyone). */
  diet: Diet;
  /** One serving. */
  macros: GapMacros;
  /** Rough ₹ per serving. Every price is an estimate; a server-side override can update them later. */
  costInr: number;
  portable: boolean;
  needsKitchen: boolean;
  needsFridge: boolean;
  /** Where it fits in the day, for a step-up line ("at dinner"). */
  slot: MealType;
};

const staple = (
  id: string,
  name: string,
  diet: Diet,
  [kcal, proteinG, carbsG, fatG]: [number, number, number, number],
  costInr: number,
  flags: { portable?: boolean; needsKitchen?: boolean; needsFridge?: boolean },
  slot: MealType,
): ProteinStaple => ({
  id,
  name,
  diet,
  macros: { kcal, proteinG, carbsG, fatG },
  costInr,
  portable: flags.portable ?? false,
  needsKitchen: flags.needsKitchen ?? false,
  needsFridge: flags.needsFridge ?? false,
  slot,
});

/** Seed list, macros per serving and 2026 prices, all rough. Soya and sattu need only water, not a kitchen. */
export const PROTEIN_STAPLES: readonly ProteinStaple[] = [
  staple("eggs_2", "2 boiled eggs", "eggetarian", [140, 12, 1, 10], 16, { portable: true }, "breakfast"),
  staple("soya_30", "30 g soya chunks", "jain", [104, 16, 10, 0], 10, {}, "dinner"),
  staple("chana_30", "30 g roasted chana", "jain", [110, 6, 17, 2], 5, { portable: true }, "snack"),
  staple("peanuts_30", "30 g peanuts", "jain", [170, 7, 5, 14], 5, { portable: true }, "snack"),
  staple("curd_200", "200 g curd", "veg", [120, 7, 9, 6], 15, { needsFridge: true }, "lunch"),
  staple("sattu_40", "40 g sattu drink", "jain", [150, 8, 24, 2], 6, { portable: true }, "breakfast"),
  staple("dal_bowl", "1 bowl dal", "jain", [150, 9, 20, 4], 10, { needsKitchen: true }, "lunch"),
  staple("milk_250", "250 ml milk", "jain", [150, 8, 12, 8], 15, { needsFridge: true }, "breakfast"),
  staple("paneer_100", "100 g paneer", "veg", [265, 18, 4, 20], 45, { needsFridge: true }, "dinner"),
  staple("chicken_150", "150 g chicken breast", "non_veg", [250, 46, 0, 5], 50, { needsKitchen: true, needsFridge: true }, "dinner"),
  staple("whey_1", "1 scoop whey", "veg", [120, 24, 3, 2], 60, { portable: true }, "snack"),
];

/** Typical protein in one meal by where it comes from, for a veg plate (estimates). Other diets scale by DIET_PROTEIN_FACTOR. */
export const MEAL_PROTEIN_G: Record<MealAccess, Record<MealType, number>> = {
  home: { breakfast: 20, lunch: 25, snack: 10, dinner: 30 },
  mess: { breakfast: 18, lunch: 22, snack: 10, dinner: 25 },
  canteen: { breakfast: 15, lunch: 20, snack: 8, dinner: 20 },
  eat_out: { breakfast: 20, lunch: 30, snack: 10, dinner: 30 },
  packed: { breakfast: 15, lunch: 20, snack: 10, dinner: 20 },
  event_food: { breakfast: 10, lunch: 20, snack: 8, dinner: 20 },
  unknown: { breakfast: 18, lunch: 22, snack: 10, dinner: 25 },
};
export const DIET_PROTEIN_FACTOR: Record<Diet, number> = { jain: 1, veg: 1, eggetarian: 1.1, non_veg: 1.25 };
/** Staple servings a day counted as realistic without asking. A tight budget gets the step-up line instead. */
export const STAPLE_SERVINGS_PER_DAY: Record<BudgetBand, number> = { comfortable: 2, careful: 1, tight: 0 };

const SLOT_ORDER: readonly MealType[] = ["breakfast", "lunch", "snack", "dinner"];

/** Meal access a standing meal source implies when the brief doesn't say. */
export function accessForSource(source: MealSource | null): MealAccess {
  if (source === "home_self" || source === "home_family") return "home";
  if (source === "mess" || source === "canteen" || source === "eat_out") return source;
  return "unknown";
}

export type ProteinInput = {
  standing: Standing;
  /** null = no brief: an assumed usual day (D79). */
  facts: DayFacts | null;
  staples: readonly ProteinStaple[];
  diet: Diet;
};

/** Staples this person can use today: diet, kitchen, fridge, a bag when travelling, and the tight-budget price cap. */
export function usableStaples(input: ProteinInput): ProteinStaple[] {
  const { standing, facts, diet } = input;
  const bagOnly = facts?.whereabouts === "travelling" || facts?.whereabouts === "other_city";
  return input.staples.filter(
    (s) =>
      dietFits(diet, s.diet) &&
      !(standing.hasKitchen === false && s.needsKitchen) &&
      !(standing.hasFridge === false && s.needsFridge) &&
      !(bagOnly && !s.portable) &&
      !(standing.budget === "tight" && s.costInr > TIGHT_MAX_INR_PER_SERVING),
  );
}

/**
 * What this person can reasonably reach today, in whole grams: typical protein per meal for each slot's access (the
 * brief's, else the standing meal source), scaled for diet, plus the best usable staples up to the budget's daily
 * servings. The plan targets min(base, this) and the ledger never pushes above it (week.ts).
 */
export function achievableProteinG(input: ProteinInput): number {
  const factor = DIET_PROTEIN_FACTOR[input.diet];
  const fallback = accessForSource(input.standing.mealSource);
  const meals = SLOT_ORDER.reduce(
    (s, slot) => s + MEAL_PROTEIN_G[input.facts?.mealAccess[slot] ?? fallback][slot] * factor,
    0,
  );
  const extra = usableStaples(input)
    .map((s) => s.macros.proteinG)
    .sort((a, b) => b - a)
    .slice(0, STAPLE_SERVINGS_PER_DAY[input.standing.budget ?? "careful"])
    .reduce((a, b) => a + b, 0);
  return Math.round(meals + extra);
}

export type ProteinStepUp = { staple: ProteinStaple; proteinG: number; costInr: number };

/**
 * The one cheap addition shown when the realistic target is under base ("+ 30 g soya chunks at dinner (≈ ₹10)"):
 * the usable staple with the most protein per rupee, or the most protein when the budget is comfortable. null when
 * there's no gap or nothing usable.
 */
export function proteinStepUp(input: ProteinInput & { gapG: number }): ProteinStepUp | null {
  if (!(input.gapG > 0)) return null;
  const byProtein = input.standing.budget === "comfortable";
  const best = usableStaples(input).sort((a, b) =>
    byProtein
      ? b.macros.proteinG - a.macros.proteinG
      : b.macros.proteinG / b.costInr - a.macros.proteinG / a.costInr,
  )[0];
  return best ? { staple: best, proteinG: best.macros.proteinG, costInr: best.costInr } : null;
}
