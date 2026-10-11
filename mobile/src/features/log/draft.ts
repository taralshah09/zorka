// The meal being checked on the confirm sheet (S16). Every logging path fills this draft — search (P12),
// text (P15), voice (P16), photo (P17), and editing a saved meal (S21) — and S16 saves it.
import { randomUUID } from "expo-crypto";
import { create } from "zustand";

import type { FollowUp, Food, ParseResult, UncertainReason } from "@/core/api/types";
import { nutritionOf } from "@/features/food/catalog";
import { saveMeal, type Meal, type MealItem, type MealSource } from "@/features/meals/store";
import {
  applyOil,
  localDate,
  mealTypeForTime,
  portion,
  sumMacros,
  ZERO_MACROS,
  type FoodUnit,
  type Macros,
  type MealType,
  type OilLevel,
} from "@shared/domain/food";

export type DraftItem = {
  key: string;
  /** What the person said ("salad"); the food name for picked foods. */
  query: string;
  food: Food | null;
  quantity: number;
  unit: FoodUnit;
  uncertain: boolean;
  reasons: UncertainReason[];
  /** Edited meals only: the saved item, used as-is when its food is no longer in the catalog. */
  snapshot?: MealItem;
};

export type Draft = {
  /** Set when editing a saved meal (S21 → Edit). */
  mealId: string | null;
  mealType: MealType;
  source: MealSource;
  loggedAt: string;
  items: DraftItem[];
  followUp: (FollowUp & { answered: number | null }) | null;
  oilLevel: OilLevel;
  photoUri: string | null;
  transcript: string | null;
  /** Measured parse time (P15 target < ~5 s), shown in dev builds. */
  parseMs: number | null;
};

type DraftState = { draft: Draft | null };
export const useDraft = create<DraftState>(() => ({ draft: null }));

const set = (fn: (d: Draft) => Draft) => {
  const d = useDraft.getState().draft;
  if (d) useDraft.setState({ draft: fn(d) });
};

const itemFromFood = (food: Food, quantity: number, unit: FoodUnit): DraftItem => ({
  key: randomUUID(),
  query: food.name,
  food,
  quantity,
  unit,
  uncertain: false,
  reasons: [],
});

function base(mealType: MealType | undefined, source: MealSource): Draft {
  const now = new Date();
  return {
    mealId: null,
    mealType: mealType ?? mealTypeForTime(now),
    source,
    loggedAt: now.toISOString(),
    items: [],
    followUp: null,
    oilLevel: "normal",
    photoUri: null,
    transcript: null,
    parseMs: null,
  };
}

export const draftActions = {
  startWithFood(food: Food, quantity: number, unit: FoodUnit, mealType?: MealType) {
    useDraft.setState({ draft: { ...base(mealType, "search"), items: [itemFromFood(food, quantity, unit)] } });
  },

  startFromParse(result: ParseResult, opts: { mealType?: MealType; photoUri?: string | null; clientMs?: number }) {
    useDraft.setState({
      draft: {
        ...base(opts.mealType, result.source),
        items: result.items.map((i) => ({
          key: randomUUID(),
          query: i.query,
          food: i.food,
          quantity: i.quantity,
          unit: i.unit,
          uncertain: i.uncertain,
          reasons: i.reasons,
        })),
        followUp: result.followUp ? { ...result.followUp, answered: null } : null,
        photoUri: opts.photoUri ?? null,
        transcript: result.transcript,
        parseMs: opts.clientMs ?? result.timings.totalMs,
      },
    });
  },

  /** S21 → Edit. Items whose food left the catalog stay as fixed snapshots (food = null, not uncertain). */
  startFromMeal(meal: Meal, foods: (id: string | null) => Food | null) {
    useDraft.setState({
      draft: {
        ...base(meal.mealType, meal.source),
        mealId: meal.id,
        loggedAt: meal.loggedAt,
        oilLevel: meal.oilLevel ?? "normal",
        photoUri: meal.photoUri,
        items: meal.items.map((i) => {
          const food = foods(i.foodId);
          return {
            key: i.id,
            query: i.name,
            food,
            quantity: i.quantity,
            unit: i.unit,
            uncertain: false,
            reasons: [],
            snapshot: food ? undefined : i,
          };
        }),
      },
    });
  },

  clear: () => useDraft.setState({ draft: null }),
  /** Undo for a just-removed item: puts the earlier draft back if it's still the one being checked. */
  restore: (prev: Draft) =>
    set((d) => (d.mealId === prev.mealId && d.loggedAt === prev.loggedAt ? prev : d)),
  setMealType: (mealType: MealType) => set((d) => ({ ...d, mealType })),
  setOil: (oilLevel: OilLevel) => set((d) => ({ ...d, oilLevel })),

  addFood: (food: Food, quantity: number, unit: FoodUnit) =>
    set((d) => ({ ...d, items: [...d.items, itemFromFood(food, quantity, unit)] })),

  /** Fixing an item (S17, or "Search instead") clears its uncertain flag. */
  replaceItem: (key: string, food: Food, quantity: number, unit: FoodUnit) =>
    set((d) => ({
      ...d,
      items: d.items.map((i) => (i.key === key ? { ...itemFromFood(food, quantity, unit), key } : i)),
    })),

  removeItem: (key: string) =>
    set((d) => {
      const index = d.items.findIndex((i) => i.key === key);
      const followUp = d.followUp
        ? {
            ...d.followUp,
            itemIndexes: d.followUp.itemIndexes.filter((x) => x !== index).map((x) => (x > index ? x - 1 : x)),
          }
        : null;
      return {
        ...d,
        items: d.items.filter((i) => i.key !== key),
        followUp: followUp && followUp.itemIndexes.length ? followUp : null,
      };
    }),

  /** P17: "Half plate or full?" — applies the answer to every item the question covers. */
  answerFollowUp: (optionIndex: number) =>
    set((d) => {
      if (!d.followUp) return d;
      const opt = d.followUp.options[optionIndex];
      if (!opt) return d;
      const covered = new Set(d.followUp.itemIndexes);
      return {
        ...d,
        followUp: { ...d.followUp, answered: optionIndex },
        items: d.items.map((i, idx) =>
          covered.has(idx) && i.food?.units.some((u) => u.unit === opt.unit)
            ? { ...i, quantity: opt.quantity, unit: opt.unit }
            : i,
        ),
      };
    }),
};

// ── Derived values ───────────────────────────────────────────────────────────────────────────────

export function itemPortion(item: DraftItem): { grams: number; macros: Macros } {
  const snap = item.snapshot;
  if (snap) return { grams: snap.grams, macros: snap };
  if (!item.food) return { grams: 0, macros: ZERO_MACROS };
  return portion(nutritionOf(item.food), item.quantity, item.unit);
}

/** Whether the oil/ghee question applies (P18): setting on and at least one home-cooked item. */
export const oilApplies = (d: Draft, promptOn: boolean) => promptOn && d.items.some((i) => i.food?.homeCooked);

/** Item macros after the oil/ghee answer (only home-cooked items change, only when the prompt is on). */
export function itemMacros(d: Draft, item: DraftItem, promptOn: boolean): Macros {
  const { grams, macros } = itemPortion(item);
  return promptOn && item.food?.homeCooked ? applyOil(macros, grams, d.oilLevel) : macros;
}

export const draftTotals = (d: Draft, promptOn: boolean): Macros =>
  sumMacros(d.items.map((i) => itemMacros(d, i, promptOn)));

/** Items that can't be saved yet: no food matched and no snapshot. */
export const unmatchedItems = (d: Draft) => d.items.filter((i) => !i.food && !i.snapshot);

/** Writes the draft as a meal (new or replacing the edited one). Returns the saved meal's id. */
export function saveDraft(userId: string, promptOn: boolean): string {
  const d = useDraft.getState().draft;
  if (!d) throw new Error("Nothing to save");
  const id = d.mealId ?? randomUUID();
  const loggedAt = new Date(d.loggedAt);
  const items: MealItem[] = d.items
    .filter((i) => i.food || i.snapshot)
    .map((i) => {
      const snap = i.snapshot;
      if (snap) return { ...snap, id: randomUUID() };
      const { grams } = itemPortion(i);
      const m = itemMacros(d, i, promptOn);
      return {
        id: randomUUID(),
        foodId: i.food!.id,
        name: i.food!.name,
        quantity: i.quantity,
        unit: i.unit,
        grams,
        kcal: m.kcal,
        proteinG: m.proteinG,
        carbsG: m.carbsG,
        fatG: m.fatG,
        diet: i.food!.diet,
        category: i.food!.category,
      };
    });
  const hasHomeCooked = d.items.some((i) => i.food?.homeCooked);
  saveMeal({
    id,
    userId,
    mealType: d.mealType,
    loggedAt: d.loggedAt,
    localDate: localDate(loggedAt),
    source: d.source,
    oilLevel: promptOn && hasHomeCooked ? d.oilLevel : null,
    photoUri: d.photoUri,
    items,
  });
  return id;
}
