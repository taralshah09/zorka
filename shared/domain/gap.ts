// P31 · The gap: what's left of today's targets and whether the day is on track (D55). Pure domain logic shared by
// mobile and backend (D24): no imports, no I/O, "now" is passed in.
//
// Constants are the ones accepted at the P31 gate (docs/DECISIONS.md D55). Changing any of them is a product decision.

export type GapMacros = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};
export type GapState = "on_track" | "under" | "over" | "done";

/** Expected share of the day's target eaten by a minute of the day: the meal-slot checkpoints. Linear in between. */
export const PACING_CHECKPOINTS: readonly (readonly [
  minute: number,
  share: number,
])[] = [
  [7 * 60, 0],
  [10 * 60 + 30, 0.25],
  [15 * 60, 0.6],
  [18 * 60, 0.7],
  [21 * 60 + 30, 1],
];
/** Eaten more than this past the budget is "over". */
export const OVER_TOLERANCE_KCAL = 100;
/** Behind the expected curve by more than this share of the target is "under". */
export const UNDER_TOLERANCE = 0.1;
/** "All goals hit": kcal within ±OVER_TOLERANCE_KCAL of the budget and protein at least this share of its target. */
export const DONE_PROTEIN_SHARE = 0.95;

export function expectedShare(minuteOfDay: number): number {
  const pts = PACING_CHECKPOINTS;
  if (minuteOfDay <= pts[0]![0]) return 0;
  for (let i = 1; i < pts.length; i++) {
    const [m1, s1] = pts[i]!;
    if (minuteOfDay <= m1) {
      const [m0, s0] = pts[i - 1]!;
      return s0 + ((s1 - s0) * (minuteOfDay - m0)) / (m1 - m0);
    }
  }
  return 1;
}

export type Gap = {
  /** Today's kcal budget: the target plus activity kcal burned. Macros are the targets as they are. */
  budget: GapMacros;
  eaten: GapMacros;
  /** budget − eaten. Negative when over. */
  remaining: GapMacros;
  state: GapState;
  /** Share of the day that should be eaten by now (0–1). */
  expectedShare: number;
  /** How far behind the curve, as a share of the target (positive = behind). */
  kcalBehind: number;
  proteinBehind: number;
  /** The gap that matters most right now. */
  focus: "protein" | "kcal" | null;
};

const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * targets − eaten + burned, and the state at `minuteOfDay` (D55). `burnedKcal` is the day's activity credit (P24); it
 * raises the kcal budget only, as on Today's hero card.
 */
export function computeGap(input: {
  targets: GapMacros;
  eaten: GapMacros;
  burnedKcal: number;
  minuteOfDay: number;
}): Gap {
  const { targets, eaten, minuteOfDay } = input;
  const burned = Math.max(
    0,
    Number.isFinite(input.burnedKcal) ? input.burnedKcal : 0,
  );
  const budget: GapMacros = { ...targets, kcal: targets.kcal + burned };
  const remaining: GapMacros = {
    kcal: round(budget.kcal - eaten.kcal),
    proteinG: round1(budget.proteinG - eaten.proteinG),
    carbsG: round1(budget.carbsG - eaten.carbsG),
    fatG: round1(budget.fatG - eaten.fatG),
  };
  const share = expectedShare(minuteOfDay);
  const kcalBehind =
    budget.kcal > 0 ? (share * budget.kcal - eaten.kcal) / budget.kcal : 0;
  const proteinBehind =
    budget.proteinG > 0
      ? (share * budget.proteinG - eaten.proteinG) / budget.proteinG
      : 0;

  let state: GapState;
  if (eaten.kcal > budget.kcal + OVER_TOLERANCE_KCAL) state = "over";
  else if (
    Math.abs(remaining.kcal) <= OVER_TOLERANCE_KCAL &&
    budget.proteinG > 0 &&
    eaten.proteinG >= DONE_PROTEIN_SHARE * budget.proteinG
  )
    state = "done";
  else if (kcalBehind > UNDER_TOLERANCE || proteinBehind > UNDER_TOLERANCE)
    state = "under";
  else state = "on_track";

  const focus: Gap["focus"] =
    state === "under"
      ? proteinBehind > UNDER_TOLERANCE
        ? "protein"
        : "kcal"
      : state === "over"
        ? "kcal"
        : null;

  return {
    budget,
    eaten,
    remaining,
    state,
    expectedShare: share,
    kcalBehind,
    proteinBehind,
    focus,
  };
}

/** Minute of the local day for a Date. */
export const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

// ── Goal days (Today's goal calendar) ────────────────────────────────────────────────────────────
// How many of a day's four goals were hit. Every day is scored against the current targets, because the app keeps
// no history of past targets. Kept here, next to the constants it uses, because shared modules import only types
// from each other (Metro can't resolve the ".js" paths the backend's NodeNext build needs for value imports).
//   calories: some food logged and kcal eaten no more than OVER_TOLERANCE_KCAL past the budget
//   protein:  at least DONE_PROTEIN_SHARE of the protein target
//   steps:    the step goal reached (no step data counts as not reached)
//   water:    the water goal reached

export type GoalDayInput = {
  /** kcal and protein eaten; `logged` is false when no food was logged that day. */
  eaten: { kcal: number; proteinG: number; logged: boolean };
  steps: number | null;
  glasses: number;
};
export type GoalDayTargets = {
  /** The day's kcal budget: the kcal target plus that day's activity credit. */
  kcal: number;
  proteinG: number;
  steps: number;
  waterGlasses: number;
};
export type GoalDay = {
  calories: boolean;
  protein: boolean;
  steps: boolean;
  water: boolean;
  /** Goals hit, 0–GOAL_COUNT. */
  hit: number;
};

export const GOAL_COUNT = 4;

export function scoreGoalDay(day: GoalDayInput, t: GoalDayTargets): GoalDay {
  const calories = day.eaten.logged && day.eaten.kcal <= t.kcal + OVER_TOLERANCE_KCAL;
  const protein = t.proteinG > 0 && day.eaten.proteinG >= t.proteinG * DONE_PROTEIN_SHARE;
  const steps = day.steps != null && day.steps >= t.steps;
  const water = t.waterGlasses > 0 && day.glasses >= t.waterGlasses;
  return { calories, protein, steps, water, hit: [calories, protein, steps, water].filter(Boolean).length };
}
