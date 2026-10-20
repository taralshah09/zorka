// AB3 · Meals the user said they'll have later ("I'll have paneer for dinner", `plan_meal`). Phone only, per profile and
// day, in the key-value store: a plan isn't a record, so it never syncs or counts toward the day. Today's timeline shows
// each one in its slot; tapping it logs it.
import { randomUUID } from "expo-crypto";
import { useMemo } from "react";
import { create } from "zustand";

import { kv } from "@/core/storage/kv";
import type { MealItem } from "@/features/meals/store";
import type { MealType } from "@shared/domain/food";

export type PlannedMeal = { id: string; mealType: MealType; text: string; items: MealItem[]; at: string };

const useVersion = create<{ v: number }>(() => ({ v: 0 }));
const bump = () => useVersion.setState((s) => ({ v: s.v + 1 }));
const key = (userId: string, date: string) => `zorka.plannedMeals.${userId}.${date}`;

export function plannedMeals(userId: string, date: string): PlannedMeal[] {
  try {
    const list = JSON.parse(kv.get(key(userId, date)) ?? "[]") as PlannedMeal[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(userId: string, date: string, list: PlannedMeal[]) {
  if (list.length) kv.set(key(userId, date), JSON.stringify(list));
  else kv.remove(key(userId, date));
  bump();
}

/** One plan per slot: planning dinner again replaces the earlier dinner plan. */
export function planMeal(userId: string, date: string, meal: Omit<PlannedMeal, "id" | "at">): PlannedMeal {
  const planned: PlannedMeal = { ...meal, id: randomUUID(), at: new Date().toISOString() };
  write(userId, date, [...plannedMeals(userId, date).filter((p) => p.mealType !== meal.mealType), planned]);
  return planned;
}

export function removePlannedMeal(userId: string, date: string, id: string) {
  write(userId, date, plannedMeals(userId, date).filter((p) => p.id !== id));
}

export function usePlannedMeals(userId: string | null, date: string): PlannedMeal[] {
  const v = useVersion((s) => s.v);
  return useMemo(() => {
    void v;
    return userId ? plannedMeals(userId, date) : [];
  }, [userId, date, v]);
}
