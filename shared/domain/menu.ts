// LA7 · Menu scan: "I'm out, what should I order?" (docs/LIFE_PLAN.md "Menu scan"). The AI only reads the menu
// (backend menu/read, one call per page); this file picks. Menu dishes become EatCandidates and reuse the P32 scoring
// (diet, junk, budget and macro fit come for free). Tweaks come from tags, never from the AI. Every number is an
// estimate and keeps its range. Pure domain logic shared by mobile and backend (D24); no runtime imports.
//
// Constants are proposals at the LA7 gate. Changing any of them is a product decision.
import type { EatCandidate, RankContext } from "./eatOptions.js";
import type { Diet, MealType } from "./food.js";
import type { GapMacros } from "./gap.js";
import type { BudgetBand } from "./life.js";

export const MENU_TAGS = [
  "fried", "gravy", "creamy", "tandoor", "grilled", "rice", "bread", "dessert", "drink", "salad", "egg", "paneer",
  "chicken", "fish", "mutton", "dal", "sharing",
] as const;
export type MenuTag = (typeof MENU_TAGS)[number];

export type Range = [number, number];
/** One dish as the menu/read endpoint returns it, plus where it came from. */
export type MenuDish = {
  id: string;
  page: number;
  name: string;
  gloss?: string;
  section?: string;
  price?: number;
  veg: boolean | null;
  tags: MenuTag[];
  est: { kcal: Range; proteinG: Range; carbsG: Range; fatG: Range };
};

export type MenuIntent = "on_plan" | "treat";

/** A dish as a candidate: the P32 fields plus what the picks screen shows. */
export type MenuCandidate = EatCandidate & {
  source: "menu";
  dishId: string;
  section: string | null;
  tags: MenuTag[];
  /** kcal and protein ranges for the portion ranked (halved when shared). */
  range: { kcal: Range; proteinG: Range };
  price: number | null;
  /** A food-database match replaced the AI estimate. */
  matched: boolean;
};

export type RankedDish = MenuCandidate & { score: number };

export type TweakCode = "less_butter_cream" | "pick_rice_or_bread" | "swap_tandoor" | "swap_bread" | "share_platter";
export type Tweak = { code: TweakCode; dishIds: string[] };

export type MenuPicks = {
  picks: RankedDish[];
  combos: Array<{ items: Array<{ dish: RankedDish; quantity: number }>; macros: GapMacros; price: number | null }>;
  tweaks: Tweak[];
  goEasy: RankedDish[];
  /** "It's a treat": extra kcal allowed for this meal, for the weekly ledger (week.ts allowanceKcal). */
  treatKcal: number;
};

/** A food-database match at or above this score replaces the AI's estimate. */
export const MENU_MATCH_MIN_SCORE = 0.8;
/** "It's a treat": this much more than what's left today, spread over the week by the ledger. */
export const MENU_TREAT_KCAL = 400;
export const MENU_MAX_PICKS = 3;
export const MENU_MAX_COMBOS = 2;
export const MENU_MAX_GO_EASY = 2;
/** On plan, rich or fried dishes rank a little lower (the ranking still prefers protein). */
export const MENU_TAG_PENALTY: Partial<Record<MenuTag, number>> = { creamy: 0.7, fried: 0.8 };
/** A combo may go this far over what's left (same as eatOptions MAX_KCAL_OVERSHOOT). */
export const MENU_COMBO_OVERSHOOT = 0.1;

const SIDE_TAGS: readonly MenuTag[] = ["bread", "rice", "drink", "dessert", "salad"];
const isSide = (tags: readonly MenuTag[]) => tags.some((t) => SIDE_TAGS.includes(t)) && !tags.includes("dal");
const mid = ([a, b]: Range) => (a + b) / 2;
const round = (n: number) => Math.round(n);

/** Lower case, no punctuation or extra spaces (same idea as foodMatch.ts normalize). */
export const normalizeDish = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Dishes from every page, once each (by normalized name; the first page's copy wins, a later price fills a gap). */
export function mergeMenuPages(pages: ReadonlyArray<readonly MenuDish[]>): MenuDish[] {
  const out = new Map<string, MenuDish>();
  for (const page of pages)
    for (const d of page) {
      const key = normalizeDish(d.name);
      if (!key) continue;
      const seen = out.get(key);
      if (!seen) out.set(key, d);
      else if (seen.price == null && d.price != null) out.set(key, { ...seen, price: d.price });
    }
  return [...out.values()];
}

function dietOf(d: MenuDish): Diet | null {
  if (d.tags.some((t) => t === "chicken" || t === "fish" || t === "mutton")) return "non_veg";
  if (d.veg === false) return d.tags.includes("egg") ? "eggetarian" : "non_veg";
  if (d.tags.includes("egg")) return "eggetarian";
  return d.veg === true ? "veg" : null;
}

function categoryOf(tags: readonly MenuTag[]): string {
  if (tags.includes("dessert")) return "sweet";
  if (tags.includes("drink")) return "drink";
  if (tags.includes("bread")) return "bread";
  if (tags.includes("rice")) return "rice";
  if (tags.includes("salad")) return "vegetable";
  if (tags.includes("fried")) return "snack";
  return "restaurant";
}

const scale = (m: GapMacros, f: number): GapMacros => ({
  kcal: m.kcal * f,
  proteinG: m.proteinG * f,
  carbsG: m.carbsG * f,
  fatG: m.fatG * f,
});

/**
 * Dish → candidate, ranked on the midpoint of its ranges. `match` looks a dish up in the food database; a strong match
 * (≥ MENU_MATCH_MIN_SCORE) replaces the AI estimate. Shared plates (and platters) count as half.
 */
export function menuToCandidates(
  dishes: readonly MenuDish[],
  opts: { match?: (name: string) => { macros: GapMacros; score: number } | null; sharing?: boolean } = {},
): MenuCandidate[] {
  return dishes.map((d) => {
    const share = opts.sharing || d.tags.includes("sharing") ? 0.5 : 1;
    const m = opts.match?.(d.name) ?? null;
    const matched = !!m && m.score >= MENU_MATCH_MIN_SCORE;
    const macros = matched
      ? m!.macros
      : { kcal: mid(d.est.kcal), proteinG: mid(d.est.proteinG), carbsG: mid(d.est.carbsG), fatG: mid(d.est.fatG) };
    const range = matched
      ? { kcal: [m!.macros.kcal, m!.macros.kcal] as Range, proteinG: [m!.macros.proteinG, m!.macros.proteinG] as Range }
      : { kcal: d.est.kcal, proteinG: d.est.proteinG };
    return {
      id: `menu:${d.id}`,
      dishId: d.id,
      name: d.gloss ? `${d.name} (${d.gloss})` : d.name,
      source: "menu" as const,
      macros: scale(macros, share),
      diet: dietOf(d),
      category: categoryOf(d.tags),
      cuisine: null,
      mealTypes: [],
      timesLogged: 0,
      estimate: !matched,
      access: ["eat_out"],
      costInrPerServing: d.price != null ? d.price * share : undefined,
      section: d.section?.trim() || null,
      tags: d.tags,
      range: {
        kcal: [round(range.kcal[0] * share), round(range.kcal[1] * share)],
        proteinG: [round(range.proteinG[0] * share), round(range.proteinG[1] * share)],
      },
      price: d.price != null ? d.price * share : null,
      matched,
    };
  });
}

export type RankMenuInput = {
  candidates: readonly MenuCandidate[];
  diet: Diet;
  budget: BudgetBand | null;
  /** What's left for this meal (today's DayPlan, or computeGap before LA3). */
  remaining: GapMacros;
  intent: MenuIntent;
  /** Follow-up chips: "no paneer", "no rice". Matched against names and tags. */
  avoid?: readonly string[];
  mealType?: MealType;
  /** The P32 ranking functions, passed in so this file has no runtime imports. */
  rank: {
    excluded: (c: EatCandidate, ctx: RankContext) => string | null;
    scoreCandidate: (c: EatCandidate, ctx: RankContext) => number;
  };
};

const avoids = (c: MenuCandidate, avoid: readonly string[]) =>
  avoid.some((w) => {
    const word = normalizeDish(w.replace(/^no\s+/i, ""));
    return !!word && (normalizeDish(c.name).includes(word) || c.tags.some((t) => t === word));
  });

const sum = (items: ReadonlyArray<{ dish: MenuCandidate; quantity: number }>): GapMacros =>
  items.reduce(
    (s, { dish, quantity }) => ({
      kcal: s.kcal + dish.macros.kcal * quantity,
      proteinG: s.proteinG + dish.macros.proteinG * quantity,
      carbsG: s.carbsG + dish.macros.carbsG * quantity,
      fatG: s.fatG + dish.macros.fatG * quantity,
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

const isButterBread = (c: MenuCandidate) => c.tags.includes("bread") && /butter|cheese|garlic/i.test(c.name);
const isTandoorBread = (c: MenuCandidate) =>
  c.tags.includes("bread") && (c.tags.includes("tandoor") || /tandoor|roti|phulka|chapati/i.test(c.name)) && !isButterBread(c);
const PROTEIN_TAGS: readonly MenuTag[] = ["paneer", "chicken", "fish", "mutton", "egg"];

/**
 * Top picks (≤ 3, one per section, mains only), 1–2 combos (a main + bread + dal or salad that fit what's left),
 * tweaks from tags, and "go easy on" (the richest main and bread the user might reach for). On plan, creamy and fried
 * dishes rank a little lower; "It's a treat" adds MENU_TREAT_KCAL to what's left, which the weekly ledger spreads.
 */
export function rankMenu(input: RankMenuInput): MenuPicks {
  const treatKcal = input.intent === "treat" ? MENU_TREAT_KCAL : 0;
  const remaining = { ...input.remaining, kcal: input.remaining.kcal + treatKcal };
  const kcalLeft = Math.max(1, remaining.kcal);
  const focus = (remaining.proteinG * 4) / kcalLeft > 0.2 ? "protein" : "kcal";
  const ctx: RankContext = {
    remaining,
    budgetKcal: kcalLeft,
    focus,
    diet: input.diet,
    mealType: input.mealType ?? "dinner",
    cuisineShare: {},
    access: "eat_out",
    budget: input.budget,
  };
  const avoid = input.avoid ?? [];
  const penalty = (c: MenuCandidate) =>
    input.intent === "on_plan" ? c.tags.reduce((p, t) => p * (MENU_TAG_PENALTY[t] ?? 1), 1) : 1;
  // Diet and avoid always apply; size ("too_big") is judged on the combo, so a main is kept for the side list too.
  const allowed: RankedDish[] = input.candidates
    .filter((c) => !avoids(c, avoid))
    .filter((c) => {
      const why = input.rank.excluded(c, { ...ctx, remaining: { ...remaining, kcal: Math.max(remaining.kcal, 1e6) } });
      return why === null;
    })
    .map((c) => ({ ...c, score: input.rank.scoreCandidate(c, ctx) * penalty(c) }))
    .sort((a, b) => b.score - a.score);
  const fits = (kcal: number) => kcal <= remaining.kcal * (1 + MENU_COMBO_OVERSHOOT);

  const mains = allowed.filter((c) => !isSide(c.tags));
  const picks: RankedDish[] = [];
  const sections = new Set<string>();
  for (const c of mains) {
    if (picks.length >= MENU_MAX_PICKS) break;
    if (!fits(c.macros.kcal)) continue;
    const s = c.section ?? c.dishId;
    if (sections.has(s)) continue;
    sections.add(s);
    picks.push(c);
  }

  const breads = allowed.filter((c) => c.tags.includes("bread")).sort((a, b) => Number(isTandoorBread(b)) - Number(isTandoorBread(a)) || a.macros.kcal - b.macros.kcal);
  const dals = allowed.filter((c) => c.tags.includes("dal") && !c.tags.includes("creamy")).sort((a, b) => b.score - a.score);
  const salads = allowed.filter((c) => c.tags.includes("salad"));
  const combos: MenuPicks["combos"] = [];
  for (const main of picks) {
    if (combos.length >= MENU_MAX_COMBOS) break;
    const items: Array<{ dish: RankedDish; quantity: number }> = [{ dish: main, quantity: 1 }];
    const bread = breads[0];
    if (bread) {
      for (const q of [2, 1]) {
        if (fits(sum([...items, { dish: bread, quantity: q }]).kcal)) {
          items.push({ dish: bread, quantity: q });
          break;
        }
      }
    }
    const dal = main.tags.includes("dal") ? undefined : dals[0];
    if (dal && fits(sum([...items, { dish: dal, quantity: 1 }]).kcal)) items.push({ dish: dal, quantity: 1 });
    const salad = salads[0];
    if (salad && fits(sum([...items, { dish: salad, quantity: 1 }]).kcal)) items.push({ dish: salad, quantity: 1 });
    if (items.length < 2) continue;
    const prices = items.map((i) => (i.dish.price == null ? null : i.dish.price * i.quantity));
    combos.push({
      items,
      macros: sum(items),
      price: prices.every((p) => p != null) ? prices.reduce((a, b) => a! + b!, 0) : null,
    });
  }

  const tweaks: Tweak[] = [];
  const creamy = picks.filter((c) => c.tags.includes("gravy") && c.tags.includes("creamy"));
  if (creamy.length) tweaks.push({ code: "less_butter_cream", dishIds: creamy.map((c) => c.dishId) });
  const all = input.candidates;
  if (all.some((c) => c.tags.includes("rice")) && all.some((c) => c.tags.includes("bread")))
    tweaks.push({ code: "pick_rice_or_bread", dishIds: [] });
  const butter = allowed.find(isButterBread);
  const plain = allowed.find(isTandoorBread);
  if (butter && plain) tweaks.push({ code: "swap_bread", dishIds: [butter.dishId, plain.dishId] });
  // The fried dish is often filtered out as junk, so look for it on the whole menu; the swap must be allowed.
  for (const fried of input.candidates.filter((c) => c.tags.includes("fried"))) {
    const protein = fried.tags.find((t) => PROTEIN_TAGS.includes(t));
    const grilled = protein && allowed.find((c) => c !== fried && c.tags.includes(protein) && (c.tags.includes("tandoor") || c.tags.includes("grilled")));
    if (grilled) {
      tweaks.push({ code: "swap_tandoor", dishIds: [fried.dishId, grilled.dishId] });
      break;
    }
  }
  const platters = picks.filter((c) => c.tags.includes("sharing"));
  if (platters.length) tweaks.push({ code: "share_platter", dishIds: platters.map((c) => c.dishId) });

  const picked = new Set(picks.map((p) => p.dishId));
  const richest = (list: RankedDish[]) => [...list].sort((a, b) => b.macros.kcal - a.macros.kcal)[0];
  const goEasy = [
    richest(mains.filter((c) => !picked.has(c.dishId) && (c.tags.includes("creamy") || c.tags.includes("fried") || c.tags.includes("gravy")))),
    richest(breads.filter(isButterBread)),
  ].filter((c): c is RankedDish => !!c).slice(0, MENU_MAX_GO_EASY);

  return { picks, combos, tweaks, goEasy, treatKcal };
}

