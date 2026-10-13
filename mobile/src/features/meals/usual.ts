// "Your usual" meals (UX L1). Saved from meal detail and logged again in one tap from quick-log. Kept on the
// phone (kv, per profile) as a snapshot of the items, so a usual survives the original meal being deleted.
// Not synced: it's a shortcut, not a record.
import { randomUUID } from "expo-crypto";
import { useMemo } from "react";
import { create } from "zustand";

import { kv, KV_KEYS } from "@/core/storage/kv";
import { localDate, type MealType } from "@shared/domain/food";
import { mealKey, saveMeal, type Meal, type MealItem } from "./store";

export type UsualMeal = { id: string; mealType: MealType; items: MealItem[]; savedAt: string };

const MAX_USUALS = 8;
const key = (userId: string) => `${KV_KEYS.usualMeals}.${userId}`;

const useUsualVersion = create<{ v: number }>(() => ({ v: 0 }));
const bump = () => useUsualVersion.setState((s) => ({ v: s.v + 1 }));

export function usualMeals(userId: string): UsualMeal[] {
  try {
    return JSON.parse(kv.get(key(userId)) ?? "[]") as UsualMeal[];
  } catch {
    return [];
  }
}

const write = (userId: string, list: UsualMeal[]) => {
  kv.set(key(userId), JSON.stringify(list.slice(0, MAX_USUALS)));
  bump();
};

export function saveUsual(userId: string, meal: Meal): UsualMeal {
  const usual: UsualMeal = {
    id: randomUUID(),
    mealType: meal.mealType,
    items: meal.items,
    savedAt: new Date().toISOString(),
  };
  write(userId, [usual, ...usualMeals(userId).filter((u) => mealKey(u) !== mealKey(meal))]);
  return usual;
}

export function removeUsual(userId: string, id: string): void {
  write(
    userId,
    usualMeals(userId).filter((u) => u.id !== id),
  );
}

/** Logs a usual now (new ids) as `mealType`. Returns the saved meal, for Undo. */
export function logUsual(userId: string, usual: UsualMeal, mealType: MealType, at = new Date()): Meal {
  const meal: Meal = {
    id: randomUUID(),
    userId,
    mealType,
    loggedAt: at.toISOString(),
    localDate: localDate(at),
    source: "repeat",
    oilLevel: null,
    photoUri: null,
    synced: false,
    items: usual.items.map((i) => ({ ...i, id: randomUUID() })),
  };
  saveMeal(meal);
  return meal;
}

export function useUsualMeals(userId: string | null): UsualMeal[] {
  const v = useUsualVersion((s) => s.v);
  return useMemo(() => {
    void v;
    return userId ? usualMeals(userId) : [];
  }, [userId, v]);
}
