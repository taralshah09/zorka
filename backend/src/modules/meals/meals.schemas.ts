// Meal logs (P12). Written on the phone first and synced as entity "meal_log" (D23). Items carry a
// snapshot of their macros, so later food edits never rewrite history.
import { z } from "zod";

import { FOOD_UNITS, MEAL_TYPES, type FoodUnit, type MealType } from "../../../../shared/domain/food.js";

export const MEAL_SOURCES = ["search", "text", "voice", "photo", "repeat"] as const;
export const OIL_LEVELS = ["little", "normal", "heavy"] as const;

export const MealItemData = z
  .object({
    id: z.string().uuid(),
    foodId: z.string().uuid().nullable(),
    name: z.string().trim().min(1).max(120),
    quantity: z.number().positive().max(1000),
    unit: z.enum(FOOD_UNITS),
    grams: z.number().min(0).max(5000),
    kcal: z.number().min(0).max(10000),
    proteinG: z.number().min(0).max(1000),
    carbsG: z.number().min(0).max(2000),
    fatG: z.number().min(0).max(1000),
  })
  .strict();

export const MealLogData = z
  .object({
    mealType: z.enum(MEAL_TYPES),
    loggedAt: z.string().datetime({ offset: true }),
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    source: z.enum(MEAL_SOURCES),
    oilLevel: z.enum(OIL_LEVELS).nullable().default(null),
    items: z.array(MealItemData).min(1).max(30),
  })
  .strict();
export type MealLogData = z.infer<typeof MealLogData>;

export const MealsQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export type MealItemDto = {
  id: string;
  foodId: string | null;
  name: string;
  quantity: number;
  unit: FoodUnit;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type MealLogDto = {
  id: string;
  mealType: MealType;
  loggedAt: string;
  localDate: string;
  source: (typeof MEAL_SOURCES)[number];
  oilLevel: (typeof OIL_LEVELS)[number] | null;
  clientUpdatedAt: string;
  items: MealItemDto[];
};
