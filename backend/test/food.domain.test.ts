// Shared food domain logic (shared/domain/food.ts, foodMatch.ts): portions, oil/ghee, diet, matching.
import { describe, expect, it } from "vitest";

import { FOODS } from "../prisma/data/foods.js";
import { foodsFromRows } from "../src/modules/foods/catalog.js";
import {
  applyOil,
  dietAllows,
  gramsPerUnit,
  mealTypeForTime,
  portion,
  sumMacros,
  type FoodNutrition,
} from "../../shared/domain/food.js";
import { bestMatch, matchScore, parseUnit, rankFoods } from "../../shared/domain/foodMatch.js";

const roti: FoodNutrition = {
  per100g: { kcal: 290, proteinG: 9.5, carbsG: 52, fatG: 5 },
  defaultUnit: "piece",
  units: [
    { unit: "piece", grams: 40 },
    { unit: "g", grams: 1 },
  ],
};
const catalog = foodsFromRows(FOODS);

describe("portion", () => {
  it("scales macros by unit grams", () => {
    expect(portion(roti, 2, "piece")).toEqual({ grams: 80, macros: { kcal: 232, proteinG: 7.6, carbsG: 41.6, fatG: 4 } });
  });
  it("falls back to the default unit for a unit the food doesn't have", () => {
    expect(gramsPerUnit(roti, "katori")).toBeNull();
    expect(portion(roti, 1, "katori").grams).toBe(40);
  });
  it("sums and rounds totals", () => {
    expect(sumMacros([portion(roti, 1, "piece").macros, portion(roti, 1, "piece").macros])).toEqual({
      kcal: 232,
      proteinG: 7.6,
      carbsG: 41.6,
      fatG: 4,
    });
  });
});

describe("applyOil (P18)", () => {
  const dal = { kcal: 165, proteinG: 8.7, carbsG: 20.3, fatG: 5.7 }; // 1 katori dal tadka
  it("normal changes nothing (standard recipe values)", () => {
    expect(applyOil(dal, 150, "normal")).toEqual(dal);
  });
  it("little removes 5 g fat per 150 g; heavy adds 10 g", () => {
    expect(applyOil(dal, 150, "little")).toEqual({ ...dal, fatG: 0.7, kcal: 120 });
    expect(applyOil(dal, 150, "heavy")).toEqual({ ...dal, fatG: 15.7, kcal: 255 });
  });
  it("scales with grams and never drives fat below 0", () => {
    expect(applyOil(dal, 300, "heavy").fatG).toBe(25.7);
    expect(applyOil({ kcal: 50, proteinG: 1, carbsG: 8, fatG: 1 }, 150, "little")).toEqual({
      kcal: 41,
      proteinG: 1,
      carbsG: 8,
      fatG: 0,
    });
  });
});

describe("diet rules (D29)", () => {
  it("jain ⊂ veg ⊂ eggetarian ⊂ non-veg", () => {
    expect(dietAllows("veg", "jain")).toBe(true);
    expect(dietAllows("jain", "veg")).toBe(false);
    expect(dietAllows("eggetarian", "eggetarian")).toBe(true);
    expect(dietAllows("veg", "eggetarian")).toBe(false);
    expect(dietAllows("non_veg", "eggetarian")).toBe(true);
  });
});

describe("mealTypeForTime", () => {
  it("picks the meal from the clock", () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 11, h, m);
    expect(mealTypeForTime(at(8))).toBe("breakfast");
    expect(mealTypeForTime(at(13, 15))).toBe("lunch");
    expect(mealTypeForTime(at(17))).toBe("snack");
    expect(mealTypeForTime(at(21))).toBe("dinner");
  });
});

describe("food matching", () => {
  const slugOf = (q: string) => bestMatch(q, catalog)?.food.slug ?? null;

  it("finds foods by name, alias and plural", () => {
    expect(slugOf("roti")).toBe("roti");
    expect(slugOf("rotis")).toBe("roti");
    expect(slugOf("rajma")).toBe("rajma");
    expect(slugOf("chaas")).toBe("chaas");
    expect(slugOf("katori dal")).not.toBeNull();
    expect(slugOf("hakka noodles")).toBe("veg-hakka-noodles");
    expect(slugOf("manchurian")).toBe("veg-manchurian-gravy");
    expect(slugOf("paneer bhurji")).toBe("paneer-bhurji");
  });

  it("returns null for things that aren't in the catalog", () => {
    expect(slugOf("quinoa tabbouleh")).toBeNull();
  });

  it("scores exact matches 1 and ranks prefix matches high", () => {
    expect(matchScore("Dal Tadka", { name: "Dal tadka", aliases: [] })).toBe(1);
    expect(rankFoods("pan", catalog).slice(0, 3).every((f) => /pan/i.test(f.name + f.aliases.join(" ")))).toBe(true);
  });

  it("maps unit words", () => {
    expect(parseUnit("katori")).toBe("katori");
    expect(parseUnit("Glasses")).toBe("glass");
    expect(parseUnit("half plate")).toBe("plate_half");
    expect(parseUnit("rotis")).toBe("piece");
    expect(parseUnit("handful")).toBeNull();
    expect(parseUnit(null)).toBeNull();
  });
});
