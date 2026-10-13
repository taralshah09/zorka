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
/** User-set daily step goal (D48). UX F13: the floor is 2,000 so a beginner can start where they are. */
export const STEP_GOAL_MIN = 2000;
export const STEP_GOAL_MAX = 100_000;

/** UX F13: the step goal onboarding suggests for an activity level (the user can change it on the plan). */
export const SUGGESTED_STEP_GOAL: Record<ActivityLevel, number> = {
  sedentary: 5000,
  light: 7000,
  moderate: 8000,
  active: 10_000,
  very_active: 12_000,
};

/** A stored or typed step goal, made safe: missing → the default; out of range → the nearest bound. */
export function clampStepGoal(goal: number | null | undefined): number {
  if (goal == null || !Number.isFinite(goal)) return STEP_TARGET;
  return Math.min(STEP_GOAL_MAX, Math.max(STEP_GOAL_MIN, Math.round(goal)));
}

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
  /** The user's daily step goal; missing means STEP_TARGET. */
  stepGoal?: number | null;
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

/** Rounds a kcal target the same way as calculateTargets: nearest 50, never under the floor. */
export const roundTargetKcal = (kcal: number, floorKcal: number) => roundKcal(Math.max(kcal, floorKcal), floorKcal);

/** Fat and carbs for a kcal target and a protein amount (D25): fat = max(25% of kcal, 0.6 g/kg), carbs = rest. */
export function macrosFor(kcal: number, proteinG: number, weightKg: number) {
  const protein = roundTo(proteinG, MACRO_ROUND);
  const fatG = roundTo(Math.max((FAT_SHARE_OF_KCAL * kcal) / 9, MIN_FAT_G_PER_KG * weightKg), MACRO_ROUND);
  const carbsG = Math.max(0, roundTo((kcal - protein * 4 - fatG * 9) / 4, MACRO_ROUND));
  return { proteinG: protein, fatG, carbsG };
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
  const { proteinG, fatG, carbsG } = macrosFor(kcal, PROTEIN_G_PER_KG[input.goal] * input.weightKg, input.weightKg);

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
    steps: clampStepGoal(input.stepGoal),
    weeklyChangeKg,
    paceCapped,
    floorApplied,
    weeksToGoal,
    goalDate,
  };
}

// ── Weekly adaptive targets (P28) ────────────────────────────────────────────────────────────────
// Constants accepted at the P28 gate (docs/DECISIONS.md D50).

/** The adjustment only runs when at least this many of the 7 days have food logged. */
export const MIN_LOGGED_DAYS = 5;
/** Largest change to the calorie target in one week, either way. */
export const MAX_WEEKLY_CHANGE_KCAL = 150;
/** Weekly trend change treated as "holding steady" for maintain / get fitter. */
const STEADY_KG_PER_WEEK = 0.25;

export type CheckinInput = {
  goal: Goal;
  /** kcal eaten on each day of the week that has food logged (days without a log are left out). */
  loggedKcal: readonly number[];
  /** Trend weight at the end of the day before the week, and at the end of the week. */
  trendStartKg: number | null;
  trendEndKg: number | null;
  /** At least one weigh-in during the week (otherwise the trend didn't really move, it just held). */
  weighedInWeek: boolean;
  /** The target in force during the week. */
  currentKcal: number;
  floorKcal: number;
  /** The plan's deficit (−) or surplus (+) per day for this goal and pace (Targets.adjustmentKcal). */
  adjustmentKcal: number;
};

export type CheckinResult =
  | { status: "not_enough_data"; reason: "days" | "weight"; loggedDays: number }
  | {
      status: "ready";
      loggedDays: number;
      avgIntakeKcal: number;
      trendChangeKg: number;
      /** What the body actually burned per day, from intake and the trend: intake − Δtrend × 7700 / 7. */
      estimatedBurnKcal: number;
      previousKcal: number;
      newKcal: number;
      changeKcal: number;
      /** The change wanted was bigger than MAX_WEEKLY_CHANGE_KCAL. */
      capped: boolean;
      floorApplied: boolean;
      /** The trend moved the way the goal wants (casual "On track ✓"). */
      onTrack: boolean;
      proteinG: number;
      carbsG: number;
      fatG: number;
    };

/**
 * The Sunday check-in: estimates real daily burn from what was eaten and how the trend weight moved, then moves
 * the calorie target toward burn + the plan's deficit/surplus, by at most MAX_WEEKLY_CHANGE_KCAL, never under the
 * floor. Protein follows the goal's g/kg at the current trend weight; fat and carbs follow D25.
 */
export function weeklyCheckin(input: CheckinInput): CheckinResult {
  const loggedDays = input.loggedKcal.length;
  if (loggedDays < MIN_LOGGED_DAYS) return { status: "not_enough_data", reason: "days", loggedDays };
  const { trendStartKg, trendEndKg } = input;
  if (!input.weighedInWeek || trendStartKg == null || trendEndKg == null) {
    return { status: "not_enough_data", reason: "weight", loggedDays };
  }

  const avgIntakeKcal = input.loggedKcal.reduce((s, k) => s + k, 0) / loggedDays;
  const trendChangeKg = trendEndKg - trendStartKg;
  const estimatedBurnKcal = avgIntakeKcal - (trendChangeKg * KCAL_PER_KG) / 7;

  const wanted = estimatedBurnKcal + input.adjustmentKcal - input.currentKcal;
  const capped = Math.abs(wanted) > MAX_WEEKLY_CHANGE_KCAL;
  const step = Math.max(-MAX_WEEKLY_CHANGE_KCAL, Math.min(MAX_WEEKLY_CHANGE_KCAL, wanted));
  const floorApplied = input.currentKcal + step < input.floorKcal;
  let newKcal = roundTargetKcal(input.currentKcal + step, input.floorKcal);
  // Rounding a target that isn't a multiple of 50 must not push the change past the cap.
  if (Math.abs(newKcal - input.currentKcal) > MAX_WEEKLY_CHANGE_KCAL && !floorApplied) {
    newKcal = input.currentKcal + Math.sign(step) * MAX_WEEKLY_CHANGE_KCAL;
  }

  const onTrack =
    input.goal === "lose_fat"
      ? trendChangeKg < 0
      : input.goal === "build_muscle"
        ? trendChangeKg > 0
        : Math.abs(trendChangeKg) <= STEADY_KG_PER_WEEK;

  return {
    status: "ready",
    loggedDays,
    avgIntakeKcal,
    trendChangeKg,
    estimatedBurnKcal,
    previousKcal: input.currentKcal,
    newKcal,
    changeKcal: newKcal - input.currentKcal,
    capped,
    floorApplied,
    onTrack,
    ...macrosFor(newKcal, PROTEIN_G_PER_KG[input.goal] * trendEndKg, trendEndKg),
  };
}
