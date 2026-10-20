// "Your usual" meals (UX L1). Saved from meal detail and logged again in one tap from quick-log. Kept on the
// phone (kv, per profile) as a snapshot of the items, so a usual survives the original meal being deleted.
// Not synced: it's a shortcut, not a record.
import { randomUUID } from "expo-crypto";
import { useMemo } from "react";
import { create } from "zustand";

import { kv, KV_KEYS } from "@/core/storage/kv";
import { localDate, type MealType } from "@shared/domain/food";
import { mealKey, saveMeal, type Meal, type MealItem } from "./store";

export type UsualMeal = { id: string; mealType: MealType; items: MealItem[]; savedAt: string; pinned?: boolean; order?: number };

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
  kv.set(key(userId), JSON.stringify(list));
  bump();
};

export function rankedUsuals(list: readonly UsualMeal[], mealType: MealType): UsualMeal[] {
  return list.filter((u) => u.mealType === mealType).sort((a, b) =>
    Number(!!b.pinned) - Number(!!a.pinned) || (a.order ?? 999) - (b.order ?? 999) || b.savedAt.localeCompare(a.savedAt));
}
export function pinUsual(userId: string, id: string, pinned: boolean) {
  write(userId, usualMeals(userId).map((u) => u.id === id ? { ...u, pinned } : u));
}
export function moveUsual(userId: string, id: string, direction: -1 | 1) {
  const list = [...usualMeals(userId)].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const index = list.findIndex((u) => u.id === id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= list.length) return;
  [list[index], list[next]] = [list[next]!, list[index]!];
  write(userId, list.map((u, order) => ({ ...u, order })));
}

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
