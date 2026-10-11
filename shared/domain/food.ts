// Food portions and macros (P11/P12/P18) — pure domain logic shared by mobile and backend (D24).
// Constants are the ones accepted at the P11 and P18 gates (docs/DECISIONS.md D29, D34). Changing any
// of them is a product decision: record it there first.

export type Diet = "veg" | "eggetarian" | "jain" | "non_veg";

/** Strictest diet first. A food tagged X fits every diet at or after X in this list (D29). */
export const DIET_ORDER: readonly Diet[] = ["jain", "veg", "eggetarian", "non_veg"];

/** True when a food tagged `food` is allowed for someone who eats `pref`. */
export function dietAllows(pref: Diet, food: Diet): boolean {
  return DIET_ORDER.indexOf(food) <= DIET_ORDER.indexOf(pref);
}

export const FOOD_UNITS = [
  "g",
  "ml",
  "piece",
  "katori",
  "bowl",
  "plate_half",
  "plate_full",
  "glass",
  "cup",
  "tbsp",
  "tsp",
  "slice",
  "serving",
] as const;
export type FoodUnit = (typeof FOOD_UNITS)[number];

/** Default grams for one unit (D29). `piece` and `serving` have no default: they are set per food. */
export const DEFAULT_UNIT_GRAMS: Partial<Record<FoodUnit, number>> = {
  g: 1,
  ml: 1,
  katori: 150,
  bowl: 250,
  plate_half: 200,
  plate_full: 350,
  glass: 250,
  cup: 150,
  tbsp: 15,
  tsp: 5,
  slice: 30,
};

export const UNIT_LABEL: Record<FoodUnit, { one: string; many: string }> = {
  g: { one: "g", many: "g" },
  ml: { one: "ml", many: "ml" },
  piece: { one: "piece", many: "pieces" },
  katori: { one: "katori", many: "katori" },
  bowl: { one: "bowl", many: "bowls" },
  plate_half: { one: "half plate", many: "half plates" },
  plate_full: { one: "full plate", many: "full plates" },
  glass: { one: "glass", many: "glasses" },
  cup: { one: "cup", many: "cups" },
  tbsp: { one: "tbsp", many: "tbsp" },
  tsp: { one: "tsp", many: "tsp" },
  slice: { one: "slice", many: "slices" },
  serving: { one: "serving", many: "servings" },
};

export type Macros = { kcal: number; proteinG: number; carbsG: number; fatG: number };
export const ZERO_MACROS: Macros = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

/** One way to measure a food, e.g. { unit: "katori", grams: 150 }. */
export type UnitOption = { unit: FoodUnit; grams: number; label?: string | null };

/** The parts of a food the portion maths needs. */
export type FoodNutrition = {
  per100g: Macros;
  defaultUnit: FoodUnit;
  units: readonly UnitOption[];
  /** true for liquids: the base unit is ml instead of g. */
  liquid?: boolean;
};

/** Units a food can be measured in: its own units plus g (or ml), in that order, without duplicates. */
export function unitOptions(food: FoodNutrition): UnitOption[] {
  const base: UnitOption = food.liquid ? { unit: "ml", grams: 1 } : { unit: "g", grams: 1 };
  const out: UnitOption[] = [];
  for (const u of [...food.units, base]) if (!out.some((o) => o.unit === u.unit)) out.push(u);
  return out;
}

/** Grams in one `unit` of this food, or null if the food can't be measured that way. */
export function gramsPerUnit(food: FoodNutrition, unit: FoodUnit): number | null {
  const own = food.units.find((u) => u.unit === unit);
  if (own) return own.grams;
  if (unit === "g" || unit === "ml") return 1;
  return null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function scaleMacros(per100g: Macros, grams: number): Macros {
  const f = grams / 100;
  return {
    kcal: Math.round(per100g.kcal * f),
    proteinG: round1(per100g.proteinG * f),
    carbsG: round1(per100g.carbsG * f),
    fatG: round1(per100g.fatG * f),
  };
}

/** Grams and macros for `quantity` × `unit` of a food. Unknown units fall back to the default unit. */
export function portion(food: FoodNutrition, quantity: number, unit: FoodUnit): { grams: number; macros: Macros } {
  const per = gramsPerUnit(food, unit) ?? gramsPerUnit(food, food.defaultUnit) ?? 100;
  const grams = Math.max(0, Math.round(quantity * per * 10) / 10);
  return { grams, macros: scaleMacros(food.per100g, grams) };
}

export function sumMacros(items: readonly Macros[]): Macros {
  const t = items.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      proteinG: acc.proteinG + m.proteinG,
      carbsG: acc.carbsG + m.carbsG,
      fatG: acc.fatG + m.fatG,
    }),
    ZERO_MACROS,
  );
  return { kcal: Math.round(t.kcal), proteinG: round1(t.proteinG), carbsG: round1(t.carbsG), fatG: round1(t.fatG) };
}

// ---------------------------------------------------------------------------------------------------
// P18 · Oil/ghee prompt (D34). Standard recipe values already include a "normal" amount of oil.
// The adjustment is per 150 g (one katori) of a home-cooked food, scaled by the item's grams.
// ---------------------------------------------------------------------------------------------------

export type OilLevel = "little" | "normal" | "heavy";
export const OIL_FAT_DELTA_G_PER_SERVING: Record<OilLevel, number> = { little: -5, normal: 0, heavy: 10 };
export const OIL_SERVING_GRAMS = 150;
export const KCAL_PER_G_FAT = 9;

/** Macros of a home-cooked item after the oil/ghee answer. Fat never drops below 0. */
export function applyOil(macros: Macros, grams: number, level: OilLevel): Macros {
  const wanted = (OIL_FAT_DELTA_G_PER_SERVING[level] * grams) / OIL_SERVING_GRAMS;
  const delta = Math.max(-macros.fatG, wanted);
  if (delta === 0) return macros;
  return {
    ...macros,
    fatG: round1(macros.fatG + delta),
    kcal: Math.max(0, Math.round(macros.kcal + delta * KCAL_PER_G_FAT)),
  };
}

// ---------------------------------------------------------------------------------------------------
// Meal types and the time-of-day default (S16 "auto from time").
// ---------------------------------------------------------------------------------------------------

export const MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

/** Breakfast before 11:00, lunch until 15:30, snack until 18:30, dinner after. */
export function mealTypeForTime(d: Date): MealType {
  const m = d.getHours() * 60 + d.getMinutes();
  if (m < 11 * 60) return "breakfast";
  if (m < 15 * 60 + 30) return "lunch";
  if (m < 18 * 60 + 30) return "snack";
  return "dinner";
}

/** Local calendar date, YYYY-MM-DD. */
export function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
