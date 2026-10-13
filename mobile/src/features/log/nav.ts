// Where a picked food goes (S18 → S19 → …). One set of params threads through search, food detail and
// create-food. A draft that needs a look ends on the confirm sheet (S16); one that doesn't is saved straight
// away with "Edit · Undo" on the toast (UX L3).
import { router } from "expo-router";
import { useCallback } from "react";

import type { Food } from "@/core/api/types";
import { reactMascot, useToast } from "@/core/ui";
import { getFood } from "@/features/food/catalog";
import { formatKcal, MEAL_LABEL } from "@/features/food/format";
import { deleteMeal, getMeal, type Meal } from "@/features/meals/store";
import { useActiveUser } from "@/features/users/activeUser";
import { useProfile } from "@/features/users/api";
import { MEAL_TYPES, type FoodUnit, type MealType } from "@shared/domain/food";
import { draftActions, draftTotals, needsCheck, saveDraft, useDraft } from "./draft";

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

/** Opens a saved meal on the confirm sheet for editing (S21 → Edit, or "Edit" on a save toast). */
export function editMeal(userId: string, meal: Meal) {
  draftActions.startFromMeal(meal, (foodId) => getFood(userId, foodId));
  router.push("/log/confirm");
}

/** "Add to {meal}" on a logged meal (UX F8): the meal opens for editing with search on top, in add mode. */
export function addToMeal(userId: string, meal: Meal) {
  draftActions.startFromMeal(meal, (foodId) => getFood(userId, foodId));
  router.push({ pathname: "/log/confirm", params: { add: "1" } });
}

/**
 * Call right after a draft is started. Saves it when nothing needs checking, else opens the confirm sheet
 * (`replace` from a capture screen, so back doesn't return to it).
 */
export function useFinishDraft() {
  const toast = useToast();
  const userId = useActiveUser((s) => s.userId);
  const promptOn = !!useProfile(userId).data?.oilGheePrompt;
  return useCallback(
    (how: "push" | "replace" = "push") => {
      const d = useDraft.getState().draft;
      if (!d || !userId) return;
      if (needsCheck(d, promptOn)) {
        if (how === "replace") router.replace("/log/confirm");
        else router.push("/log/confirm");
        return;
      }
      const kcal = draftTotals(d, promptOn).kcal;
      const id = saveDraft(userId, promptOn);
      reactMascot("happy");
      router.dismissTo("/(tabs)/today");
      draftActions.clear();
      toast({
        kind: "success",
        message: `${MEAL_LABEL[d.mealType]} logged · ${formatKcal(kcal)}`,
        action: {
          label: "Edit",
          onPress: () => {
            const meal = getMeal(id);
            if (meal) editMeal(userId, meal);
          },
        },
        onUndo: () => {
          const meal = getMeal(id);
          if (meal) deleteMeal(meal);
        },
      });
    },
    [toast, userId, promptOn],
  );
}

export function finishPick(
  food: Food,
  quantity: number,
  unit: FoodUnit,
  p: PickParams,
  finish: ReturnType<typeof useFinishDraft>,
) {
  const mode = pickMode(p);
  if (mode === "replace" && p.key) {
    draftActions.replaceItem(p.key, food, quantity, unit);
    router.dismissTo("/log/confirm");
  } else if (mode === "add") {
    draftActions.addFood(food, quantity, unit);
    router.dismissTo("/log/confirm");
  } else {
    draftActions.startWithFood(food, quantity, unit, mealTypeParam(p));
    finish();
  }
}
