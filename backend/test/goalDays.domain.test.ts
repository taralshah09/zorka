// Goal days for the Today calendar (shared/domain/gap.ts) and the water goal bounds (shared/domain/water.ts).
import { describe, expect, it } from "vitest";

import { scoreGoalDay } from "../../shared/domain/gap.js";
import { clampWaterGoal, WATER_GOAL_DEFAULT } from "../../shared/domain/water.js";

const T = { kcal: 2000, proteinG: 120, steps: 8000, waterGlasses: 8 };

describe("scoreGoalDay", () => {
  it("counts all four goals when each is hit", () => {
    const d = scoreGoalDay({ eaten: { kcal: 1950, proteinG: 118, logged: true }, steps: 9000, glasses: 8 }, T);
    expect(d).toEqual({ calories: true, protein: true, steps: true, water: true, hit: 4 });
  });

  it("allows 100 kcal over the budget, not more", () => {
    const at = (kcal: number) => scoreGoalDay({ eaten: { kcal, proteinG: 0, logged: true }, steps: null, glasses: 0 }, T);
    expect(at(2100).calories).toBe(true);
    expect(at(2101).calories).toBe(false);
  });

  it("needs food logged for calories, and step data for steps", () => {
    const d = scoreGoalDay({ eaten: { kcal: 0, proteinG: 0, logged: false }, steps: null, glasses: 0 }, T);
    expect(d).toEqual({ calories: false, protein: false, steps: false, water: false, hit: 0 });
  });

  it("needs 95% of protein and the full water goal", () => {
    const d = scoreGoalDay({ eaten: { kcal: 1000, proteinG: 113, logged: true }, steps: 7999, glasses: 7 }, T);
    expect(d).toMatchObject({ calories: true, protein: false, steps: false, water: false, hit: 1 });
    expect(scoreGoalDay({ eaten: { kcal: 0, proteinG: 114, logged: true }, steps: 0, glasses: 9 }, T)).toMatchObject({
      protein: true,
      water: true,
    });
  });
});

describe("clampWaterGoal", () => {
  it("falls back to the default and keeps 1–20", () => {
    expect(clampWaterGoal(null)).toBe(WATER_GOAL_DEFAULT);
    expect(clampWaterGoal(0)).toBe(1);
    expect(clampWaterGoal(50)).toBe(20);
    expect(clampWaterGoal(6.4)).toBe(6);
  });
});
