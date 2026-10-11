// Where a picked food goes (S18 → S19 → …). One set of params threads through search, food detail and
// create-food so every path ends on the confirm sheet (S16).
import { router } from "expo-router";

import type { Food } from "@/core/api/types";
import { MEAL_TYPES, type FoodUnit, type MealType } from "@shared/domain/food";
import { draftActions } from "./draft";

/** new = start a meal with this food · add = add to the open draft · replace = fix draft item `key`. */
export type PickMode = "new" | "add" | "replace";
export type PickParams = { mode?: string; key?: string; mealType?: string; q?: string };

export const pickMode = (p: PickParams): PickMode => (p.mode === "add" || p.mode === "replace" ? p.mode : "new");
export const mealTypeParam = (p: PickParams): MealType | undefined =>
  (MEAL_TYPES as readonly string[]).includes(p.mealType ?? "") ? (p.mealType as MealType) : undefined;

/** Only the params the next screen needs (expo-router params must be strings). */
export const passParams = (p: PickParams): Record<string, string> =>
  Object.fromEntries(
    Object.entries({ mode: p.mode, key: p.key, mealType: p.mealType }).filter(([, v]) => !!v),
  ) as Record<string, string>;

export function finishPick(food: Food, quantity: number, unit: FoodUnit, p: PickParams) {
  const mode = pickMode(p);
  if (mode === "replace" && p.key) {
    draftActions.replaceItem(p.key, food, quantity, unit);
    router.dismissTo("/log/confirm");
  } else if (mode === "add") {
    draftActions.addFood(food, quantity, unit);
    router.dismissTo("/log/confirm");
  } else {
    draftActions.startWithFood(food, quantity, unit, mealTypeParam(p));
    router.push("/log/confirm");
  }
}
