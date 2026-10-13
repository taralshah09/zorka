// The meal being checked on the confirm sheet (S16). Every logging path fills this draft — search (P12),
// text (P15), voice (P16), photo (P17), and editing a saved meal (S21) — and S16 saves it.
import { randomUUID } from "expo-crypto";
import { create } from "zustand";

import type { FollowUp, Food, ParseResult, UncertainReason } from "@/core/api/types";
import { nutritionOf } from "@/features/food/catalog";
import { saveMeal, type Meal, type MealItem, type MealSource } from "@/features/meals/store";
import { logTime } from "@/features/today/selectedDay";
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
  /**
   * Voice (UX L5): `food` is a web estimate built in memory, not a catalog food. It saves with no food id, and the
   * diet only when the web said it.
   */
  estimate?: { dietKnown: boolean };
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
  /** Voice only: unmatched items to look up on the web and fill with an estimate (UX L5). */
  autoAdd: string[];
};

type DraftState = { draft: Draft | null };
export const useDraft = create<DraftState>(() => ({ draft: null }));

/** What the user can change on the confirm sheet; two equal fingerprints mean nothing was changed. */
const fingerprint = (d: Draft) =>
  JSON.stringify([
    d.mealType,
    d.oilLevel,
    d.followUp?.answered ?? null,
    d.items.map((i) => [i.key, i.food?.id ?? null, i.quantity, i.unit]),
  ]);

/** The draft as it was started (UX L6): back only asks "Discard changes?" when the draft moved from this. */
let baseline: string | null = null;
const start = (draft: Draft) => {
  baseline = fingerprint(draft);
  useDraft.setState({ draft });
};

export const isDraftDirty = (): boolean => {
  const d = useDraft.getState().draft;
  return !!d && fingerprint(d) !== baseline;
};

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

/** A new meal is stamped on the day Today is showing (a past day logs at the current time of day). */
function base(mealType: MealType | undefined, source: MealSource): Draft {
  const now = logTime();
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
    autoAdd: [],
  };
}

export const draftActions = {
  startWithFood(food: Food, quantity: number, unit: FoodUnit, mealType?: MealType) {
    start({ ...base(mealType, "search"), items: [itemFromFood(food, quantity, unit)] });
  },

  startFromParse(result: ParseResult, opts: { mealType?: MealType; photoUri?: string | null; clientMs?: number }) {
    const items: DraftItem[] = result.items.map((i) => ({
      key: randomUUID(),
      query: i.query,
      food: i.food,
      quantity: i.quantity,
      unit: i.unit,
      uncertain: i.uncertain,
      reasons: i.reasons,
    }));
    start({
      ...base(opts.mealType, result.source),
      items,
      autoAdd: result.source === "voice" ? items.filter((i) => !i.food).map((i) => i.key) : [],
      followUp: result.followUp ? { ...result.followUp, answered: null } : null,
      photoUri: opts.photoUri ?? null,
      transcript: result.transcript,
      parseMs: opts.clientMs ?? result.timings.totalMs,
    });
  },

  /** S21 → Edit. Items whose food left the catalog stay as fixed snapshots (food = null, not uncertain). */
  startFromMeal(meal: Meal, foods: (id: string | null) => Food | null) {
    start({
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
    });
  },

  clear: () => useDraft.setState({ draft: null }),
  /**
   * UX L5: fills an unmatched voice item with the web's estimate (marked "estimate", still to check). The app did
   * this, not the user, so it doesn't count as a change for "Discard changes?".
   */
  applyEstimate(key: string, food: Food, dietKnown: boolean) {
    const d = useDraft.getState().draft;
    const item = d?.items.find((i) => i.key === key);
    if (!d || !item || item.food || item.snapshot) return;
    const wasDirty = isDraftDirty();
    const fits = food.units.some((u) => u.unit === item.unit);
    const byWeight = item.unit === "g" || item.unit === "ml";
    const next: Draft = {
      ...d,
      autoAdd: d.autoAdd.filter((k) => k !== key),
      items: d.items.map((i) =>
        i.key === key
          ? {
              ...i,
              food,
              unit: fits ? i.unit : food.defaultUnit,
              quantity: fits || !byWeight ? i.quantity : 1,
              uncertain: true,
              estimate: { dietKnown },
            }
          : i,
      ),
    };
    useDraft.setState({ draft: next });
    if (!wasDirty) baseline = fingerprint(next);
  },
  /** The web had nothing for this item: stop looking, it stays unmatched for the user to fix. */
  dropAutoAdd: (key: string) => set((d) => ({ ...d, autoAdd: d.autoAdd.filter((k) => k !== key) })),
  /** Undo for a just-removed item: puts the earlier draft back if it's still the one being checked. */
  restore: (prev: Draft) => set((d) => (d.mealId === prev.mealId && d.loggedAt === prev.loggedAt ? prev : d)),
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

  /** UX F7: the row's − / +. Settles "How much?" (vague quantity), but not a wrong match or a web estimate. */
  setQuantity: (key: string, quantity: number) =>
    set((d) => ({
      ...d,
      items: d.items.map((i) => {
        if (i.key !== key) return i;
        const reasons = i.reasons.filter((r) => r !== "vague_quantity");
        const settled = i.uncertain && !i.estimate && reasons.length === 0;
        return { ...i, quantity, reasons, uncertain: settled ? false : i.uncertain };
      }),
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

/**
 * Whether the draft needs the confirm sheet (UX L3): an item is unsure or unmatched, a follow-up question is
 * open, or the oil/ghee question applies (the user turned it on to be asked). Otherwise it saves straight away.
 */
export const needsCheck = (d: Draft, promptOn: boolean): boolean =>
  d.items.length === 0 ||
  d.items.some((i) => i.uncertain || (!i.food && !i.snapshot)) ||
  (!!d.followUp && d.followUp.answered === null) ||
  oilApplies(d, promptOn);

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
        foodId: i.estimate ? null : i.food!.id,
        name: i.food!.name,
        quantity: i.quantity,
        unit: i.unit,
        grams,
        kcal: m.kcal,
        proteinG: m.proteinG,
        carbsG: m.carbsG,
        fatG: m.fatG,
        diet: i.estimate && !i.estimate.dietKnown ? null : i.food!.diet,
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
