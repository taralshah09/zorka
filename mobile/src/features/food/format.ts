// Copy helpers for food logging (DESIGN.md §8.1: always show the unit).
import type { FoodCategory } from "@/core/api/types";
import type { IconName } from "@/core/icons/Icon";
import { UNIT_LABEL, type FoodUnit, type MealType } from "@shared/domain/food";

export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  snack: "Snacks",
  dinner: "Dinner",
};

const trim = (n: number) => String(Math.round(n * 100) / 100);

/** "2 pieces", "1 katori", "Half plate", "150 g". */
export function formatPortion(quantity: number, unit: FoodUnit): string {
  if (unit === "plate_half" || unit === "plate_full") {
    const label = UNIT_LABEL[unit][quantity === 1 ? "one" : "many"];
    return quantity === 1 ? label.charAt(0).toUpperCase() + label.slice(1) : `${trim(quantity)} ${label}`;
  }
  return `${trim(quantity)} ${UNIT_LABEL[unit][quantity === 1 ? "one" : "many"]}`;
}

/** Unit name for pickers ("katori", "half plate"). */
export const unitName = (unit: FoodUnit) => UNIT_LABEL[unit].one;

export const formatKcal = (kcal: number) => `${Math.round(kcal).toLocaleString("en-IN")} kcal`;
export const formatGrams = (g: number) => `${Math.round(g)} g`;

/** Category icon tile (D15, brand §10): no food photos, a tinted symbol per category. */
export const CATEGORY_TILE: Record<FoodCategory, { icon: IconName; tint: "orchid" | "lilac" | "lime" }> = {
  home_meal: { icon: "restaurant", tint: "orchid" },
  bread: { icon: "restaurant", tint: "orchid" },
  rice: { icon: "restaurant", tint: "orchid" },
  vegetable: { icon: "restaurant", tint: "orchid" },
  restaurant: { icon: "ramen_dining", tint: "lilac" },
  protein: { icon: "egg", tint: "orchid" },
  dairy: { icon: "egg", tint: "orchid" },
  drink: { icon: "local_cafe", tint: "lilac" },
  snack: { icon: "cookie", tint: "lime" },
  sweet: { icon: "cookie", tint: "lime" },
  fruit: { icon: "cookie", tint: "lime" },
};

export const CUISINE_LABEL = {
  indian: "Indian",
  indo_chinese: "Indo-Chinese",
  italian: "Italian",
  continental: "Continental",
  other: null,
} as const;
