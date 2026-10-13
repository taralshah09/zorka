// P08 target calculator (shared/domain/targets.ts). Lives here because backend owns the test runner.
import { describe, expect, it } from "vitest";

import {
  calculateTargets,
  clampStepGoal,
  mifflinStJeor,
  STEP_TARGET,
  SUGGESTED_STEP_GOAL,
  validateTargetInput,
  type TargetInput,
} from "../../shared/domain/targets.js";

const TODAY = new Date(2026, 9, 11); // 11 Oct 2026, local time

const base: TargetInput = {
  goal: "lose_fat",
  sex: "male",
  age: 30,
  heightCm: 178,
  weightKg: 80,
  activityLevel: "moderate",
  targetWeightKg: 72,
  pace: "steady",
};

describe("mifflinStJeor", () => {
  it("uses +5 for male, âˆ’161 for female and the âˆ’78 midpoint for prefer-not-to-say", () => {
    const body = { age: 30, heightCm: 178, weightKg: 80 };
    expect(mifflinStJeor({ ...body, sex: "male" })).toBe(1767.5);
    expect(mifflinStJeor({ ...body, sex: "female" })).toBe(1601.5);
    expect(mifflinStJeor({ ...body, sex: "unspecified" })).toBe(1684.5);
  });
});

describe("calculateTargets Â· lose fat", () => {
  it("applies activity, a % body-weight deficit, macros, steps and a goal date", () => {
    const t = calculateTargets(base, TODAY);
    expect(t.bmr).toBe(1767.5);
    expect(t.tdee).toBeCloseTo(2739.625, 6);
    expect(t.adjustmentKcal).toBeCloseTo(-660, 6); // 0.75% of 80 kg = 0.6 kg/week
    expect(t.weeklyChangeKg).toBeCloseTo(-0.6, 6);
    expect(t).toMatchObject({
      kcal: 2100,
      proteinG: 160, // 2.0 g/kg
      fatG: 60, // 25% of kcal
      carbsG: 230, // the remainder
      steps: 8000,
      paceCapped: false,
      floorApplied: false,
      weeksToGoal: 14, // ceil(8 / 0.6)
      goalDate: "2027-01-17",
    });
  });

  it("scales the pace with body weight", () => {
    const rate = (pace: TargetInput["pace"]) => calculateTargets({ ...base, pace }, TODAY).weeklyChangeKg;
    expect(rate("gentle")).toBeCloseTo(-0.4, 6);
    expect(rate("steady")).toBeCloseTo(-0.6, 6);
    expect(rate("ambitious")).toBeCloseTo(-0.8, 6);
  });

  it("caps the pace at 1 kg/week", () => {
    const t = calculateTargets(
      { ...base, heightCm: 180, weightKg: 120, activityLevel: "active", targetWeightKg: 100, pace: "ambitious" },
      TODAY,
    );
    expect(t.paceCapped).toBe(true);
    expect(t.weeklyChangeKg).toBe(-1);
    expect(t.adjustmentKcal).toBeCloseTo(-1100, 6);
    expect(t.kcal).toBe(2650);
    expect(t.weeksToGoal).toBe(20);
  });

  it("holds the calorie floor and slows the pace instead", () => {
    const t = calculateTargets(
      {
        goal: "lose_fat",
        sex: "female",
        age: 45,
        heightCm: 155,
        weightKg: 50,
        activityLevel: "sedentary",
        targetWeightKg: 45,
        pace: "ambitious",
      },
      TODAY,
    );
    expect(t.floorKcal).toBe(1200); // the sex floor beats a BMR of 1,082.75
    expect(t.floorApplied).toBe(true);
    expect(t.kcal).toBe(1200);
    expect(t.weeklyChangeKg).toBeCloseTo(-0.0903, 4); // what's left of the deficit
    expect(t.weeksToGoal).toBe(56);
  });

  it("uses BMR as the floor when it's higher, and never rounds below it", () => {
    const t = calculateTargets({ ...base, activityLevel: "sedentary", pace: "ambitious" }, TODAY);
    expect(t.floorKcal).toBe(1767.5);
    expect(t.floorApplied).toBe(true);
    expect(t.kcal).toBe(1800); // nearest 50 would be 1,750, under the floor
    expect(t.weeklyChangeKg).toBeCloseTo(-0.3214, 4);
  });

  it("gives no goal date when TDEE is already under the floor", () => {
    const t = calculateTargets(
      { ...base, age: 70, heightCm: 160, weightKg: 50, activityLevel: "sedentary", targetWeightKg: 48, pace: "gentle" },
      TODAY,
    );
    expect(t.tdee).toBeLessThan(1500);
    expect(t).toMatchObject({ kcal: 1500, floorApplied: true, weeklyChangeKg: 0, weeksToGoal: null, goalDate: null });
  });
});

describe("calculateTargets Â· build muscle", () => {
  it("adds the pace surplus and projects the gain", () => {
    const t = calculateTargets(
      {
        goal: "build_muscle",
        sex: "female",
        age: 25,
        heightCm: 165,
        weightKg: 60,
        activityLevel: "light",
        targetWeightKg: 64,
        pace: "steady",
      },
      TODAY,
    );
    expect(t.adjustmentKcal).toBe(250);
    expect(t.weeklyChangeKg).toBeCloseTo(0.2273, 4);
    expect(t).toMatchObject({ kcal: 2100, proteinG: 110, fatG: 60, carbsG: 280, weeksToGoal: 18, floorApplied: false });
  });

  it("maps gentle / steady / ambitious to +150 / +250 / +350 kcal", () => {
    const input: TargetInput = { ...base, goal: "build_muscle", targetWeightKg: 85 };
    const surplus = (pace: TargetInput["pace"]) => calculateTargets({ ...input, pace }, TODAY).adjustmentKcal;
    expect([surplus("gentle"), surplus("steady"), surplus("ambitious")]).toEqual([150, 250, 350]);
  });
});

describe("calculateTargets Â· maintain and get fitter", () => {
  const input: TargetInput = {
    goal: "maintain",
    sex: "unspecified",
    age: 40,
    heightCm: 170,
    weightKg: 70,
    activityLevel: "sedentary",
  };

  it("eats at TDEE with no pace and no goal date", () => {
    const t = calculateTargets(input, TODAY);
    expect(t.bmr).toBe(1484.5);
    expect(t).toMatchObject({
      adjustmentKcal: 0,
      kcal: 1800,
      proteinG: 110, // 1.6 g/kg
      fatG: 50,
      carbsG: 230,
      weeklyChangeKg: null,
      weeksToGoal: null,
      goalDate: null,
    });
  });

  it("treats get fitter like maintain and ignores any pace or target weight", () => {
    const t = calculateTargets({ ...input, goal: "get_fitter", pace: "ambitious", targetWeightKg: 60 }, TODAY);
    expect(t).toMatchObject({ kcal: 1800, adjustmentKcal: 0, weeklyChangeKg: null, goalDate: null });
  });
});

describe("macros", () => {
  it("never puts fat under 0.6 g/kg or carbs under 0, and the kcal is a multiple of 50", () => {
    const inputs: TargetInput[] = [
      base,
      { ...base, weightKg: 140, heightCm: 165, targetWeightKg: 120, activityLevel: "sedentary", pace: "ambitious" },
      { ...base, goal: "maintain", sex: "female", weightKg: 45, heightCm: 150, age: 60 },
    ];
    for (const input of inputs) {
      const t = calculateTargets(input, TODAY);
      expect(t.fatG).toBeGreaterThanOrEqual(Math.floor((0.6 * input.weightKg) / 5) * 5);
      expect(t.carbsG).toBeGreaterThanOrEqual(0);
      expect(t.kcal % 50).toBe(0);
      expect(t.kcal).toBeGreaterThanOrEqual(t.floorKcal);
    }
  });
});

describe("validateTargetInput", () => {
  it("needs a target weight below current to lose fat", () => {
    expect(validateTargetInput({ ...base, targetWeightKg: 80 })).toEqual(["target_not_below_current"]);
    expect(validateTargetInput({ ...base, targetWeightKg: null })).toEqual(["target_weight_required"]);
  });

  it("needs a target weight above current to build muscle", () => {
    expect(validateTargetInput({ ...base, goal: "build_muscle", targetWeightKg: 79 })).toEqual([
      "target_not_above_current",
    ]);
  });

  it("needs a pace for goals that have one, and nothing extra for maintain", () => {
    expect(validateTargetInput({ ...base, pace: null })).toEqual(["pace_required"]);
    expect(validateTargetInput({ ...base, goal: "maintain", pace: null, targetWeightKg: null })).toEqual([]);
  });

  it("makes calculateTargets throw on invalid input", () => {
    expect(() => calculateTargets({ ...base, targetWeightKg: 90 }, TODAY)).toThrow(/target_not_below_current/);
  });
});

describe("step goal (D48)", () => {
  it("defaults to 8,000 and uses the user's goal when set", () => {
    expect(calculateTargets(base, TODAY).steps).toBe(8000);
    expect(calculateTargets({ ...base, stepGoal: null }, TODAY).steps).toBe(8000);
    expect(calculateTargets({ ...base, stepGoal: 12_500 }, TODAY).steps).toBe(12_500);
  });

  it("keeps the goal between 2,000 and 100,000 (UX F13)", () => {
    expect(clampStepGoal(5000)).toBe(5000);
    expect(clampStepGoal(1500)).toBe(2000);
    expect(clampStepGoal(100_000)).toBe(100_000);
    expect(clampStepGoal(250_000)).toBe(100_000);
    expect(clampStepGoal(Number.NaN)).toBe(8000);
  });

  it("suggests a goal from the activity level, inside the bounds", () => {
    expect(SUGGESTED_STEP_GOAL.sedentary).toBe(5000);
    expect(SUGGESTED_STEP_GOAL.moderate).toBe(STEP_TARGET);
    for (const goal of Object.values(SUGGESTED_STEP_GOAL)) expect(clampStepGoal(goal)).toBe(goal);
  });
});
