// P33 · "Move" options for the Gap Closer (D57): activity × duration from intensity × body weight, and easing tomorrow's
// target instead of a late-night workout. Pure domain logic shared by mobile and backend (D24). MET values are passed in
// by the caller (the recorder's presets in activity.ts) so this file has no runtime imports.
//
// Constants are the ones accepted at the P33 gate (docs/DECISIONS.md D57). Changing any of them is a product decision.

export type MoveActivity = "walk" | "ride" | "run";

/** After this minute of the day no activity is suggested; tomorrow's target eases instead. */
export const LATE_NIGHT_MINUTE = 21 * 60 + 30;
export const MAX_MINUTES: Record<MoveActivity, number> = {
  walk: 60,
  ride: 60,
  run: 45,
};
export const MIN_MINUTES = 10;
export const MINUTE_STEP = 5;
/** Easing: at most this much per day, over at most EASE_MAX_DAYS days, never below the calorie floor. */
export const EASE_MAX_PER_DAY = 150;
export const EASE_MAX_DAYS = 2;
/** The walk in a "spread it" option. */
export const SPREAD_WALK_MINUTES = 30;
/** Steps per minute of brisk walking, for the step-gap option. */
export const BRISK_STEPS_PER_MINUTE = 100;
/** Low activity: after this minute, steps under this share of the goal. */
export const LOW_ACTIVITY_MINUTE = 17 * 60;
export const LOW_ACTIVITY_SHARE = 0.6;

export type ActivityOption = {
  kind: "activity";
  activity: MoveActivity;
  minutes: number;
  kcal: number;
  closes: boolean;
};
export type SpreadOption = {
  kind: "spread";
  activity: "walk";
  minutes: number;
  kcal: number;
  easePerDay: number;
  days: number;
};
export type EaseOption = { kind: "ease"; easePerDay: number; days: number };
export type StepsOption = {
  kind: "steps";
  activity: "walk";
  minutes: number;
  kcal: number;
  steps: number;
  points: number;
};
export type MoveOption =
  ActivityOption | SpreadOption | EaseOption | StepsOption;

export type MoveInput = {
  /** remaining kcal (negative = over). */
  remainingKcal: number;
  weightKg: number;
  minuteOfDay: number;
  met: Record<MoveActivity, number>;
  /** Tomorrow's kcal target and the calorie floor, so easing never goes below the floor. */
  tomorrowKcal: number;
  floorKcal: number;
  /** Today's steps (null = not connected) and the step goal. */
  steps: number | null;
  stepGoal: number;
  /** Over by less than this isn't worth moving for (D55's over tolerance). */
  overToleranceKcal: number;
};

const kcalPerMinute = (met: number, kg: number) => (met * kg) / 60;
const roundUp = (n: number, step: number) => Math.ceil(n / step) * step;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** Minutes of `activity` to burn `kcal`, rounded to 5 and capped (D57). */
export function minutesFor(
  kcal: number,
  met: number,
  weightKg: number,
  cap: number,
): { minutes: number; closes: boolean } {
  const perMin = kcalPerMinute(met, weightKg);
  if (!(perMin > 0) || !(kcal > 0)) return { minutes: 0, closes: false };
  const needed = Math.max(MIN_MINUTES, roundTo(kcal / perMin, MINUTE_STEP));
  return needed <= cap
    ? { minutes: needed, closes: true }
    : { minutes: cap, closes: false };
}

/** Split `kcal` over up to EASE_MAX_DAYS days, ≤ EASE_MAX_PER_DAY a day, never pushing tomorrow under the floor. */
export function easePlan(
  kcal: number,
  tomorrowKcal: number,
  floorKcal: number,
): EaseOption | null {
  const headroom = Math.max(0, tomorrowKcal - floorKcal);
  const cap = Math.min(EASE_MAX_PER_DAY, Math.floor(headroom / 10) * 10);
  if (kcal <= 0 || cap <= 0) return null;
  const days = kcal > cap ? EASE_MAX_DAYS : 1;
  const perDay = Math.min(cap, roundUp(kcal / days, 10));
  return { kind: "ease", easePerDay: perDay, days };
}

export const isLateNight = (minuteOfDay: number) =>
  minuteOfDay >= LATE_NIGHT_MINUTE;

/**
 * Move options for the current state:
 * - over, before 21:30: walk / ride / run that close it (capped), and "spread it" when a capped walk doesn't;
 * - over, after 21:30: only easing tomorrow;
 * - not over: a brisk walk for the step gap (after 17:00, under 60% of the goal), else a 30-minute walk and ride.
 */
export function moveOptions(input: MoveInput): MoveOption[] {
  const { weightKg, minuteOfDay, met } = input;
  const over = -input.remainingKcal;
  const late = isLateNight(minuteOfDay);

  if (over > input.overToleranceKcal) {
    if (late) {
      const ease = easePlan(over, input.tomorrowKcal, input.floorKcal);
      return ease ? [ease] : [];
    }
    const out: MoveOption[] = [];
    for (const activity of ["walk", "ride", "run"] as const) {
      const { minutes, closes } = minutesFor(
        over,
        met[activity],
        weightKg,
        MAX_MINUTES[activity],
      );
      if (!minutes) continue;
      out.push({
        kind: "activity",
        activity,
        minutes,
        kcal: Math.round(kcalPerMinute(met[activity], weightKg) * minutes),
        closes,
      });
    }
    const walk = out.find(
      (o): o is ActivityOption =>
        o.kind === "activity" && o.activity === "walk",
    );
    if (walk && !walk.closes) {
      const minutes = SPREAD_WALK_MINUTES;
      const kcal = Math.round(kcalPerMinute(met.walk, weightKg) * minutes);
      const ease = easePlan(over - kcal, input.tomorrowKcal, input.floorKcal);
      if (ease)
        out.push({
          kind: "spread",
          activity: "walk",
          minutes,
          kcal,
          easePerDay: ease.easePerDay,
          days: ease.days,
        });
    }
    return out;
  }

  if (late) return [];
  const out: MoveOption[] = [];
  const stepsLeft = input.steps === null ? 0 : input.stepGoal - input.steps;
  if (
    input.steps !== null &&
    minuteOfDay >= LOW_ACTIVITY_MINUTE &&
    input.steps < input.stepGoal * LOW_ACTIVITY_SHARE &&
    stepsLeft > 0
  ) {
    const minutes = Math.min(
      MAX_MINUTES.walk,
      Math.max(
        MIN_MINUTES,
        roundUp(stepsLeft / BRISK_STEPS_PER_MINUTE, MINUTE_STEP),
      ),
    );
    out.push({
      kind: "steps",
      activity: "walk",
      minutes,
      kcal: Math.round(kcalPerMinute(met.walk, weightKg) * minutes),
      steps: minutes * BRISK_STEPS_PER_MINUTE,
      // Move points: 1 a minute at moderate intensity (activity.ts movePoints, MET 3–6).
      points: minutes,
    });
  }
  for (const activity of ["walk", "ride"] as const) {
    if (out.some((o) => o.kind === "steps") && activity === "walk") continue;
    const minutes = 30;
    out.push({
      kind: "activity",
      activity,
      minutes,
      kcal: Math.round(kcalPerMinute(met[activity], weightKg) * minutes),
      closes: false,
    });
  }
  return out;
}
