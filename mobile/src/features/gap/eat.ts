// P32 · Eat options on the phone (D56). Gathers candidates from the user's past meals ("Your usual", last 30 days), home
// foods from the catalog (portion sized to the gap) and nearby dishes (P34), then ranks them with the shared rules.
import { useMemo } from "react";

import type { DietPref, Food, NearbyOption } from "@/core/api/types";
import { getFood, localFoods, nutritionOf, useFoodsVersion } from "@/features/food/catalog";
import { formatPortion } from "@/features/food/format";
import { mealTotals, mealsBetween, useMealsVersion, type Meal } from "@/features/meals/store";
import {
  bestPortion,
  rankEatOptions,
  type EatCandidate,
  type RankContext,
  type RankedOption,
} from "@shared/domain/eatOptions";
import { DIET_ORDER, mealTypeForTime, portion, type FoodUnit, type Macros, type MealType } from "@shared/domain/food";
import type { Gap } from "@shared/domain/gap";
import { addDays } from "@shared/domain/progress";

export const USUAL_DAYS = 30;
const HOME_CATEGORIES = new Set(["home_meal", "protein", "dairy", "vegetable", "fruit", "drink"]);
/** Home drinks only when protein-dense (milk, whey shake), never juices or tea. */
const MIN_DRINK_PROTEIN_SHARE = 0.25;
const MAX_NAME_ITEMS = 3;

export type EatAction =
  | { kind: "repeat"; meal: Meal }
  | { kind: "food"; food: Food; quantity: number; unit: FoodUnit }
  | { kind: "nearby"; option: NearbyOption };

export type EatOption = RankedOption & { action: EatAction; detail: string | null };

const mealKey = (m: Meal) =>
  m.items
    .map((i) => (i.foodId ?? i.name).toLowerCase())
    .sort()
    .join("|");

const mealName = (m: Meal) => {
  const names = m.items.map((i) => i.name);
  return names.length > MAX_NAME_ITEMS
    ? `${names.slice(0, MAX_NAME_ITEMS).join(" + ")} + ${names.length - MAX_NAME_ITEMS} more`
    : names.join(" + ");
};

/** The least strict diet among a meal's items; unknown items count as the profile's diet (they ate it). */
function mealDiet(m: Meal, profileDiet: DietPref): DietPref {
  let worst = 0;
  for (const i of m.items) worst = Math.max(worst, DIET_ORDER.indexOf(i.diet ?? profileDiet));
  return DIET_ORDER[worst] ?? profileDiet;
}

type History = {
  usual: EatCandidate[];
  actions: Map<string, EatAction>;
  foodCounts: Map<string, number>;
  cuisineShare: Record<string, number>;
};

function readHistory(userId: string, today: string, profileDiet: DietPref): History {
  const meals = mealsBetween(userId, addDays(today, -USUAL_DAYS), today);
  const groups = new Map<string, { latest: Meal; count: number; types: Set<MealType> }>();
  const foodCounts = new Map<string, number>();
  const cuisines = new Map<string, number>();
  let items = 0;
  for (const m of meals) {
    if (!m.items.length) continue;
    const key = mealKey(m);
    const g = groups.get(key);
    if (g) {
      g.count++;
      g.latest = m;
      g.types.add(m.mealType);
    } else groups.set(key, { latest: m, count: 1, types: new Set([m.mealType]) });
    for (const i of m.items) {
      items++;
      if (i.foodId) foodCounts.set(i.foodId, (foodCounts.get(i.foodId) ?? 0) + 1);
      const cuisine = getFood(userId, i.foodId)?.cuisine;
      if (cuisine) cuisines.set(cuisine, (cuisines.get(cuisine) ?? 0) + 1);
    }
  }
  const cuisineShare: Record<string, number> = {};
  for (const [c, n] of cuisines) cuisineShare[c] = items ? n / items : 0;

  const usual: EatCandidate[] = [];
  const actions = new Map<string, EatAction>();
  for (const [key, g] of groups) {
    const m = g.latest;
    const first = m.items[0]!;
    const id = `usual:${key}`;
    usual.push({
      id,
      name: mealName(m),
      source: "usual",
      macros: mealTotals(m),
      diet: mealDiet(m, profileDiet),
      category: m.items.length === 1 ? first.category : "home_meal",
      cuisine: getFood(userId, first.foodId)?.cuisine ?? null,
      mealTypes: [...g.types],
      timesLogged: g.count,
      estimate: false,
    });
    actions.set(id, { kind: "repeat", meal: m });
  }
  return { usual, actions, foodCounts, cuisineShare };
}

/** Quantities to try for a home food: whole pieces/slices up to 4, otherwise 1–2 of its default unit. */
const quantitiesFor = (unit: FoodUnit) =>
  unit === "piece" || unit === "slice" ? [1, 2, 3, 4] : unit === "g" || unit === "ml" ? [] : [1, 1.5, 2];

function homeCandidates(
  foods: readonly Food[],
  history: History,
  ctx: RankContext,
  actions: Map<string, EatAction>,
): EatCandidate[] {
  const out: EatCandidate[] = [];
  for (const food of foods) {
    if (!HOME_CATEGORIES.has(food.category)) continue;
    const n = nutritionOf(food);
    if (food.category === "drink") {
      const p = food.per100g;
      if (!p.kcal || (p.proteinG * 4) / p.kcal < MIN_DRINK_PROTEIN_SHARE) continue;
    }
    const portions = quantitiesFor(food.defaultUnit).map((quantity) => ({
      quantity,
      macros: portion(n, quantity, food.defaultUnit).macros as Macros,
    }));
    const best = bestPortion(portions, ctx);
    if (!best) continue;
    const id = `home:${food.id}`;
    out.push({
      id,
      name: food.name,
      source: "home",
      macros: best.macros,
      diet: food.diet,
      category: food.category,
      cuisine: food.cuisine,
      mealTypes: [],
      timesLogged: history.foodCounts.get(food.id) ?? 0,
      estimate: false,
    });
    actions.set(id, { kind: "food", food, quantity: best.quantity, unit: food.defaultUnit });
  }
  return out;
}

function nearbyCandidates(options: readonly NearbyOption[], actions: Map<string, EatAction>): EatCandidate[] {
  return options.map((o) => {
    const id = `nearby:${o.id}`;
    actions.set(id, { kind: "nearby", option: o });
    return {
      id,
      name: o.name,
      source: o.source,
      macros: o.macros,
      diet: o.diet,
      category: o.source === "zomato" ? "restaurant" : null,
      cuisine: null,
      mealTypes: [],
      timesLogged: 0,
      estimate: true,
    };
  });
}

function detailFor(o: RankedOption, action: EatAction): string | null {
  if (action.kind === "food") return formatPortion(action.quantity, action.unit);
  if (action.kind === "nearby") return action.option.restaurant;
  return o.timesLogged > 1 ? `Logged ${o.timesLogged}× this month` : null;
}

function rankFor(userId: string, history: History, gap: Gap, diet: DietPref, mealType: MealType, nearby: readonly NearbyOption[]): EatOption[] {
  if (gap.remaining.kcal <= 0) return [];
  const r = gap.remaining;
  const focus =
    gap.focus ??
    (gap.budget.proteinG > 0 && r.proteinG / gap.budget.proteinG > r.kcal / Math.max(1, gap.budget.kcal)
      ? "protein"
      : "kcal");
  const ctx: RankContext = {
    remaining: r,
    budgetKcal: gap.budget.kcal,
    focus,
    diet,
    mealType,
    cuisineShare: history.cuisineShare,
  };
  const actions = new Map(history.actions);
  const candidates = [
    ...history.usual,
    ...homeCandidates(localFoods(userId), history, ctx, actions),
    ...nearbyCandidates(nearby, actions),
  ];
  return rankEatOptions(candidates, ctx).map((o) => {
    const action = actions.get(o.id)!;
    return { ...o, action, detail: detailFor(o, action) };
  });
}

/**
 * The same ranking without React, for the assistant's "what should I eat (for dinner)?" (the bubble runs headless).
 * One history read serves every meal asked for.
 */
export function eatOptionsFor(input: {
  userId: string;
  today: string;
  gap: Gap;
  diet: DietPref;
  mealTypes: readonly MealType[];
}): Partial<Record<MealType, EatOption[]>> {
  const history = readHistory(input.userId, input.today, input.diet);
  const out: Partial<Record<MealType, EatOption[]>> = {};
  for (const m of input.mealTypes) out[m] = rankFor(input.userId, history, input.gap, input.diet, m, []);
  return out;
}

/** 3–5 ranked options for the gap (D56). Empty while over or when nothing fits. */
export function useEatOptions(input: {
  userId: string | null;
  today: string;
  now: number;
  gap: Gap | null;
  diet: DietPref;
  profileDiet: DietPref;
  nearby: readonly NearbyOption[];
}): EatOption[] {
  const { userId, today, now, gap, diet, profileDiet, nearby } = input;
  const mealsV = useMealsVersion((s) => s.v);
  const foodsV = useFoodsVersion((s) => s.v);
  const mealType = mealTypeForTime(new Date(now));
  const history = useMemo(() => {
    void mealsV;
    void foodsV;
    return userId ? readHistory(userId, today, profileDiet) : null;
  }, [userId, today, profileDiet, mealsV, foodsV]);

  return useMemo(
    () => (!userId || !gap || !history ? [] : rankFor(userId, history, gap, diet, mealType, nearby)),
    [userId, gap, history, diet, mealType, nearby],
  );
}
