// Turns the compact curated rows (prisma/data/foods.ts) into food records. Used by the seed and tests.
import { stableUuid } from "../../lib/stableId.js";
import { DEFAULT_UNIT_GRAMS, FOOD_UNITS, type FoodUnit } from "../../../../shared/domain/food.js";
import type { FoodRow } from "../../../prisma/data/foods.js";

export type CatalogFood = {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  cuisine: FoodRow[3];
  category: FoodRow[4];
  diet: FoodRow[5];
  homeCooked: boolean;
  liquid: boolean;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  defaultUnit: FoodUnit;
  units: { unit: FoodUnit; grams: number }[];
};

/** Stable UUID (v5 layout) for a curated food, so re-seeding never changes ids the phone has cached. */
export const curatedFoodId = (slug: string): string => stableUuid(`kimbo-food:${slug}`);

function parseUnits(slug: string, spec: string, liquid: boolean): { unit: FoodUnit; grams: number }[] {
  const out: { unit: FoodUnit; grams: number }[] = [];
  for (const part of spec.split(/\s+/).filter(Boolean)) {
    const [name, gramsText] = part.split(":");
    if (!(FOOD_UNITS as readonly string[]).includes(name!)) throw new Error(`${slug}: unknown unit "${name}"`);
    const unit = name as FoodUnit;
    const grams = gramsText ? Number(gramsText) : DEFAULT_UNIT_GRAMS[unit];
    if (!grams || !Number.isFinite(grams) || grams <= 0) throw new Error(`${slug}: unit "${unit}" needs grams`);
    if (out.some((u) => u.unit === unit)) throw new Error(`${slug}: duplicate unit "${unit}"`);
    out.push({ unit, grams });
  }
  if (!out.length) throw new Error(`${slug}: no units`);
  // Every food can also be measured in plain g (or ml for liquids).
  const base: FoodUnit = liquid ? "ml" : "g";
  if (!out.some((u) => u.unit === base)) out.push({ unit: base, grams: 1 });
  return out;
}

export function foodsFromRows(rows: readonly FoodRow[]): CatalogFood[] {
  const seen = new Set<string>();
  return rows.map(([slug, name, aliases, cuisine, category, diet, kcal, protein, carbs, fat, units, flags = ""]) => {
    if (seen.has(slug)) throw new Error(`Duplicate food slug "${slug}"`);
    seen.add(slug);
    const liquid = flags.includes("l");
    const parsed = parseUnits(slug, units, liquid);
    return {
      id: curatedFoodId(slug),
      slug,
      name,
      aliases,
      cuisine,
      category,
      diet,
      homeCooked: flags.includes("h"),
      liquid,
      kcalPer100g: kcal,
      proteinPer100g: protein,
      carbsPer100g: carbs,
      fatPer100g: fat,
      defaultUnit: parsed[0]!.unit,
      units: parsed,
    };
  });
}
