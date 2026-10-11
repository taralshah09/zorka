// Request schemas and DTOs for foods (P11 catalog, P12 search, P13 user-created foods).
import { z } from "zod";

import { FOOD_UNITS, type FoodUnit, type Macros } from "../../../../shared/domain/food.js";
import { DIETS } from "../users/users.schemas.js";

export const CUISINES = ["indian", "indo_chinese", "italian", "continental", "other"] as const;
export const FOOD_CATEGORIES = [
  "home_meal",
  "restaurant",
  "bread",
  "rice",
  "protein",
  "dairy",
  "drink",
  "snack",
  "sweet",
  "fruit",
  "vegetable",
] as const;

export const FoodIdParams = z.object({ foodId: z.string().uuid() });
export const FoodSearchQuery = z.object({
  q: z.string().trim().max(80).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

/** P13: a food the user creates on the phone. Synced as entity "custom_food" (D23). */
export const CustomFoodData = z
  .object({
    name: z.string().trim().min(1).max(80),
    diet: z.enum(DIETS),
    category: z.enum(FOOD_CATEGORIES).default("home_meal"),
    homeCooked: z.boolean().default(false),
    liquid: z.boolean().default(false),
    /** The serving the user described, e.g. { unit: "piece", grams: 60 }. */
    serving: z.object({ unit: z.enum(FOOD_UNITS), grams: z.number().positive().max(2000) }),
    /** Macros for ONE serving, as typed on S20. Stored per 100 g. */
    kcal: z.number().min(0).max(5000),
    proteinG: z.number().min(0).max(500),
    carbsG: z.number().min(0).max(1000),
    fatG: z.number().min(0).max(500),
  })
  .strict();
export type CustomFoodData = z.infer<typeof CustomFoodData>;

export type FoodDto = {
  id: string;
  name: string;
  aliases: string[];
  cuisine: (typeof CUISINES)[number];
  category: (typeof FOOD_CATEGORIES)[number];
  diet: (typeof DIETS)[number];
  homeCooked: boolean;
  liquid: boolean;
  per100g: Macros;
  defaultUnit: FoodUnit;
  units: { unit: FoodUnit; grams: number; label: string | null }[];
  source: string;
  /** true for a user-created food (P13). */
  custom: boolean;
  updatedAt: string;
};
