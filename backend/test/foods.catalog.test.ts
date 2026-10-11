// P11 curated catalog: structure checks and a sanity check on the numbers themselves.
import { describe, expect, it } from "vitest";

import { FOODS } from "../prisma/data/foods.js";
import { curatedFoodId, foodsFromRows } from "../src/modules/foods/catalog.js";
import { portion, unitOptions } from "../../shared/domain/food.js";

const foods = foodsFromRows(FOODS);

describe("curated food catalog", () => {
  it("parses every row, with unique slugs and ids", () => {
    expect(foods.length).toBeGreaterThanOrEqual(150);
    expect(new Set(foods.map((f) => f.id)).size).toBe(foods.length);
  });

  it("gives every food a base g/ml unit and a default unit with grams", () => {
    for (const f of foods) {
      expect(f.units.some((u) => u.unit === (f.liquid ? "ml" : "g")), f.slug).toBe(true);
      expect(f.units[0]!.unit, f.slug).toBe(f.defaultUnit);
    }
  });

  it("has kcal close to 4·P + 4·C + 9·F (catches typos in the data)", () => {
    // Alcohol adds ~7 kcal/g that P/C/F don't cover.
    const ALCOHOLIC = new Set(["beer"]);
    const off = foods.filter((f) => {
      if (ALCOHOLIC.has(f.slug)) return false;
      const atwater = 4 * f.proteinPer100g + 4 * f.carbsPer100g + 9 * f.fatPer100g;
      return Math.abs(atwater - f.kcalPer100g) > Math.max(15, f.kcalPer100g * 0.12);
    });
    expect(off.map((f) => `${f.slug}: ${f.kcalPer100g} vs ${4 * f.proteinPer100g + 4 * f.carbsPer100g + 9 * f.fatPer100g}`)).toEqual([]);
  });

  it("keeps curated ids stable across runs", () => {
    expect(curatedFoodId("roti")).toBe(curatedFoodId("roti"));
    expect(curatedFoodId("roti")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("converts Indian units for a sample dish (P11 done-when)", () => {
    const rajma = foods.find((f) => f.slug === "rajma")!;
    const nutrition = {
      per100g: { kcal: rajma.kcalPer100g, proteinG: rajma.proteinPer100g, carbsG: rajma.carbsPer100g, fatG: rajma.fatPer100g },
      defaultUnit: rajma.defaultUnit,
      units: rajma.units,
    };
    expect(unitOptions(nutrition).map((u) => u.unit)).toEqual(["katori", "bowl", "g"]);
    expect(portion(nutrition, 1, "katori")).toEqual({ grams: 150, macros: { kcal: 210, proteinG: 9.8, carbsG: 24, fatG: 8.3 } });
  });
});
