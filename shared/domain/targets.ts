// Target calculator (P08) — pure domain logic shared by mobile and backend (D24).
// No imports and no I/O: everything a caller needs is passed in, including "today".
//
// Constants are the ones accepted at the P08 gate (docs/DECISIONS.md D25). Changing any of them is a
// product decision: record it there first.

export type Goal = "lose_fat" | "build_muscle" | "maintain" | "get_fitter";
export type Sex = "male" | "female" | "unspecified";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Pace = "gentle" | "steady" | "ambitious";

/** Mifflin-St Jeor sex constant. "Prefer not to say" uses the midpoint of the two. */
export const SEX_CONSTANT: Record<Sex, number> = { male: 5, female: -161, unspecified: -78 };

export const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Lose fat: share of body weight lost per week. */
export const LOSS_RATE_PCT: Record<Pace, number> = { gentle: 0.005, steady: 0.0075, ambitious: 0.01 };
/** Hard cap on any loss pace (S07 "Capped at 1 kg/week"). */
export const MAX_LOSS_KG_PER_WEEK = 1.0;
/** Build muscle: daily calorie surplus. */
export const SURPLUS_KCAL: Record<Pace, number> = { gentle: 150, steady: 250, ambitious: 350 };
/** Energy in 1 kg of body weight change. */
export const KCAL_PER_KG = 7700;

/** The floor is max(BMR, this). */
export const SEX_FLOOR_KCAL: Record<Sex, number> = { male: 1500, female: 1200, unspecified: 1350 };

export const PROTEIN_G_PER_KG: Record<Goal, number> = {
  lose_fat: 2.0,
  build_muscle: 1.8,
  maintain: 1.6,
  get_fitter: 1.6,
};
export const FAT_SHARE_OF_KCAL = 0.25;
export const MIN_FAT_G_PER_KG = 0.6;
export const STEP_TARGET = 8000;

const KCAL_ROUND = 50;
const MACRO_ROUND = 5;

export type TargetInput = {
  goal: Goal;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  /** Required for lose_fat and build_muscle; ignored otherwise. */
  targetWeightKg?: number | null;
  /** Required for lose_fat and build_muscle; ignored otherwise. */
  pace?: Pace | null;
};

export type Targets = {
  bmr: number;
  tdee: number;
  activityMultiplier: number;
  /** Daily kcal change applied to TDEE before the floor: negative = deficit, positive = surplus. */
  adjustmentKcal: number;
  floorKcal: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  steps: number;
  /** Planned weekly weight change in kg, signed (loss < 0). null when the goal has no pace. */
  weeklyChangeKg: number | null;
  /** The loss pace asked for exceeded MAX_LOSS_KG_PER_WEEK and was capped. */
  paceCapped: boolean;
  /** The calorie floor raised the target (and slowed or stopped the planned loss). */
  floorApplied: boolean;
  weeksToGoal: number | null;
  /** Local calendar date, YYYY-MM-DD. null when there's no target weight or no progress toward it. */
  goalDate: string | null;
};

export type TargetIssue =
  "pace_required" | "target_weight_required" | "target_not_below_current" | "target_not_above_current";

/** Goals that use a target weight and pace. */
export function goalHasPace(goal: Goal): boolean {
  return goal === "lose_fat" || goal === "build_muscle";
}

export function validateTargetInput(input: TargetInput): TargetIssue[] {
  if (!goalHasPace(input.goal)) return [];
  const issues: TargetIssue[] = [];
  if (!input.pace) issues.push("pace_required");
  if (input.targetWeightKg == null) {
    issues.push("target_weight_required");
  } else if (input.goal === "lose_fat" && input.targetWeightKg >= input.weightKg) {
    issues.push("target_not_below_current");
  } else if (input.goal === "build_muscle" && input.targetWeightKg <= input.weightKg) {
    issues.push("target_not_above_current");
  }
  return issues;
}

export function mifflinStJeor({
  sex,
  age,
  heightCm,
  weightKg,
}: Pick<TargetInput, "sex" | "age" | "heightCm" | "weightKg">) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + SEX_CONSTANT[sex];
}

const roundTo = (v: number, step: number) => Math.round(v / step) * step;

/** Rounds kcal to the nearest 50 without ever landing below the floor. */
function roundKcal(kcal: number, floor: number): number {
  const r = roundTo(kcal, KCAL_ROUND);
  return r < floor ? Math.ceil(floor / KCAL_ROUND) * KCAL_ROUND : r;
}

function addDays(today: Date, days: number): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Starting targets: Mifflin-St Jeor × activity, then the goal-pace adjustment, the calorie floor,
 * macros, steps and a projected goal date. Throws on input that fails validateTargetInput.
 */
export function calculateTargets(input: TargetInput, today: Date = new Date()): Targets {
  const issues = validateTargetInput(input);
  if (issues.length) throw new Error(`Invalid target input: ${issues.join(", ")}`);

  const bmr = mifflinStJeor(input);
  const activityMultiplier = ACTIVITY_MULTIPLIER[input.activityLevel];
  const tdee = bmr * activityMultiplier;
  const floorKcal = Math.max(bmr, SEX_FLOOR_KCAL[input.sex]);

  let adjustmentKcal = 0;
  let weeklyChangeKg: number | null = null;
  let paceCapped = false;

  if (input.goal === "lose_fat") {
    const requested = input.weightKg * LOSS_RATE_PCT[input.pace!];
    paceCapped = requested > MAX_LOSS_KG_PER_WEEK;
    const rate = Math.min(requested, MAX_LOSS_KG_PER_WEEK);
    adjustmentKcal = -(rate * KCAL_PER_KG) / 7;
    weeklyChangeKg = -rate;
  } else if (input.goal === "build_muscle") {
    adjustmentKcal = SURPLUS_KCAL[input.pace!];
    weeklyChangeKg = (adjustmentKcal * 7) / KCAL_PER_KG;
  }

  const planned = tdee + adjustmentKcal;
  const floorApplied = planned < floorKcal;
  const kcalExact = Math.max(planned, floorKcal);

  // The floor slows a planned loss to whatever deficit is left (none if TDEE is under the floor).
  if (floorApplied && input.goal === "lose_fat") {
    const rate = (Math.max(0, tdee - floorKcal) * 7) / KCAL_PER_KG;
    weeklyChangeKg = rate === 0 ? 0 : -rate;
  }

  const kcal = roundKcal(kcalExact, floorKcal);
  const proteinG = roundTo(PROTEIN_G_PER_KG[input.goal] * input.weightKg, MACRO_ROUND);
  const fatG = roundTo(Math.max((FAT_SHARE_OF_KCAL * kcal) / 9, MIN_FAT_G_PER_KG * input.weightKg), MACRO_ROUND);
  const carbsG = Math.max(0, roundTo((kcal - proteinG * 4 - fatG * 9) / 4, MACRO_ROUND));

  let weeksToGoal: number | null = null;
  let goalDate: string | null = null;
  if (goalHasPace(input.goal) && weeklyChangeKg && input.targetWeightKg != null) {
    weeksToGoal = Math.ceil(Math.abs(input.targetWeightKg - input.weightKg) / Math.abs(weeklyChangeKg));
    goalDate = addDays(today, weeksToGoal * 7);
  }

  return {
    bmr,
    tdee,
    activityMultiplier,
    adjustmentKcal,
    floorKcal,
    kcal,
    proteinG,
    carbsG,
    fatG,
    steps: STEP_TARGET,
    weeklyChangeKg,
    paceCapped,
    floorApplied,
    weeksToGoal,
    goalDate,
  };
}
