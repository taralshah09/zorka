// Gym logging (P19–P22) — pure domain logic shared by mobile and backend (D24).
// Constants are the ones accepted at the P19/P20 gates (docs/DECISIONS.md D38, D39). Changing any of them
// is a product decision: record it there first.

/** FitNotes-style categories (D38). */
export const EXERCISE_CATEGORIES = ["chest", "back", "shoulders", "biceps", "triceps", "legs", "abs", "cardio"] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

/** What a set records (D38): weight + reps, reps only, a hold time, or distance + time. */
export const EXERCISE_TYPES = ["weight_reps", "reps", "time", "distance_time"] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  legs: "Legs",
  abs: "Abs",
  cardio: "Cardio",
};

export const TYPE_LABEL: Record<ExerciseType, string> = {
  weight_reps: "Weight and reps",
  reps: "Reps only",
  time: "Time",
  distance_time: "Distance and time",
};

// ── MuscleWiki reference links (D38) ────────────────────────────────────────────────────────────

export const MUSCLEWIKI_ORIGIN = "https://musclewiki.com";
/** Browse page, for finding a link for a user-created exercise. */
export const MUSCLEWIKI_BROWSE_URL = `${MUSCLEWIKI_ORIGIN}/exercises`;

export const musclewikiUrl = (slug: string) => `${MUSCLEWIKI_ORIGIN}/exercise/${slug}`;

/** Accepts only https links on musclewiki.com (any page). Returns the cleaned URL, or null. */
export function cleanMusclewikiUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
  const m = /^https:\/\/(?:www\.)?musclewiki\.com(\/[A-Za-z0-9\-_/]*)?(?:[?#].*)?$/i.exec(withScheme);
  if (!m) return null;
  const path = (m[1] ?? "/").replace(/\/+$/, "");
  return `${MUSCLEWIKI_ORIGIN}${path}`;
}

// ── Rest timer (D40) ────────────────────────────────────────────────────────────────────────────

export const DEFAULT_REST_S = 90;
export const REST_STEP_S = 15;
export const MIN_REST_S = 15;
export const MAX_REST_S = 600;

export const clampRest = (s: number) =>
  Math.min(MAX_REST_S, Math.max(MIN_REST_S, Math.round(s / REST_STEP_S) * REST_STEP_S));

// ── Sets ────────────────────────────────────────────────────────────────────────────────────────

/** The numbers a set can carry. Which ones are used depends on the exercise type. */
export type SetValues = {
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
};

export const EMPTY_SET: SetValues = { weightKg: null, reps: null, durationS: null, distanceM: null };

const pos = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/** True when the set has every number its type needs (weight 0 is fine: bodyweight pull-ups). */
export function isSetComplete(type: ExerciseType, s: SetValues): boolean {
  switch (type) {
    case "weight_reps":
      return pos(s.reps) && typeof s.weightKg === "number" && s.weightKg >= 0;
    case "reps":
      return pos(s.reps);
    case "time":
      return pos(s.durationS);
    case "distance_time":
      return pos(s.distanceM) && pos(s.durationS);
  }
}

/** Only the fields the type uses; the rest become null. */
export function valuesFor(type: ExerciseType, s: SetValues): SetValues {
  return {
    weightKg: type === "weight_reps" ? s.weightKg : null,
    reps: type === "weight_reps" || type === "reps" ? s.reps : null,
    durationS: type === "time" || type === "distance_time" ? s.durationS : null,
    distanceM: type === "distance_time" ? s.distanceM : null,
  };
}

/** Estimated one-rep max, Epley (D39): w × (1 + reps / 30). One rep = the weight itself. */
export function e1rm(weightKg: number | null, reps: number | null): number | null {
  if (!pos(weightKg) || !pos(reps)) return null;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

/** kg × reps for weighted sets; 0 for everything else. */
export const setVolume = (type: ExerciseType, s: SetValues) =>
  type === "weight_reps" && pos(s.weightKg) && pos(s.reps) ? s.weightKg * s.reps : 0;

// ── Personal records (D39) ──────────────────────────────────────────────────────────────────────
// A set is a PR when it beats every earlier set of the same exercise (history plus the earlier sets of
// this workout). Weight + reps: heaviest weight OR best estimated 1RM; at 0 kg (bodyweight): most reps.
// Reps only: most reps. Time: longest hold. Distance + time: longest distance. With nothing earlier to
// beat there is no PR, so a first-ever session doesn't light up every set.

export type PrKind = "weight" | "e1rm" | "reps" | "time" | "distance";
export const PR_KINDS: readonly PrKind[] = ["weight", "e1rm", "reps", "time", "distance"];

export const PR_LABEL: Record<PrKind, string> = {
  weight: "Heaviest weight",
  e1rm: "Best est. 1RM",
  reps: "Most reps",
  time: "Longest time",
  distance: "Longest distance",
};

/** Best values so far. null = no earlier set to compare with. */
export type Bests = {
  weightKg: number | null;
  e1rm: number | null;
  /** Most reps: reps-only exercises, or weight + reps at 0 kg. */
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
};

export const NO_BESTS: Bests = { weightKg: null, e1rm: null, reps: null, durationS: null, distanceM: null };

const max = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b));

/** Folds one completed set into the bests. Incomplete sets are ignored. */
export function addToBests(b: Bests, type: ExerciseType, s: SetValues): Bests {
  if (!isSetComplete(type, s)) return b;
  switch (type) {
    case "weight_reps":
      return s.weightKg! > 0
        ? { ...b, weightKg: max(b.weightKg, s.weightKg), e1rm: max(b.e1rm, e1rm(s.weightKg, s.reps)) }
        : { ...b, weightKg: max(b.weightKg, 0), reps: max(b.reps, s.reps) };
    case "reps":
      return { ...b, reps: max(b.reps, s.reps) };
    case "time":
      return { ...b, durationS: max(b.durationS, s.durationS) };
    case "distance_time":
      return { ...b, distanceM: max(b.distanceM, s.distanceM) };
  }
}

export const bestsOf = (type: ExerciseType, sets: readonly SetValues[]): Bests =>
  sets.reduce<Bests>((b, s) => addToBests(b, type, s), NO_BESTS);

/** Which records this set breaks. Empty = not a PR. */
export function prKinds(type: ExerciseType, s: SetValues, b: Bests): PrKind[] {
  if (!isSetComplete(type, s)) return [];
  const out: PrKind[] = [];
  switch (type) {
    case "weight_reps":
      if (s.weightKg! > 0) {
        if (b.weightKg !== null && s.weightKg! > b.weightKg) out.push("weight");
        const e = e1rm(s.weightKg, s.reps);
        if (b.e1rm !== null && e !== null && e > b.e1rm + 0.05) out.push("e1rm");
      } else if (b.reps !== null && s.reps! > b.reps) {
        out.push("reps");
      }
      break;
    case "reps":
      if (b.reps !== null && s.reps! > b.reps) out.push("reps");
      break;
    case "time":
      if (b.durationS !== null && s.durationS! > b.durationS) out.push("time");
      break;
    case "distance_time":
      if (b.distanceM !== null && s.distanceM! > b.distanceM) out.push("distance");
      break;
  }
  return out;
}

/** PR kinds for each set of one exercise in one workout, in order, given the history before it. */
export function prsForSequence(
  type: ExerciseType,
  history: Bests,
  sets: readonly (SetValues & { done: boolean })[],
): PrKind[][] {
  let b = history;
  return sets.map((s) => {
    if (!s.done) return [];
    const kinds = prKinds(type, s, b);
    b = addToBests(b, type, s);
    return kinds;
  });
}

// ── Formatting ──────────────────────────────────────────────────────────────────────────────────

/** 77.5, 80, 2.25 (no trailing zeros). */
export const formatKg = (kg: number) => String(Math.round(kg * 100) / 100);

/** 90 → "1:30", 3725 → "1:02:05". */
export function formatClock(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** "77.5 × 8", "12 reps", "1:30", "2.5 km · 14:00". Empty string when the set is incomplete. */
export function formatSet(type: ExerciseType, s: SetValues): string {
  if (!isSetComplete(type, s)) return "";
  switch (type) {
    case "weight_reps":
      return s.weightKg! > 0 ? `${formatKg(s.weightKg!)} × ${s.reps}` : `${s.reps} reps`;
    case "reps":
      return `${s.reps} reps`;
    case "time":
      return formatClock(s.durationS!);
    case "distance_time":
      return `${formatKg(s.distanceM! / 1000)} km · ${formatClock(s.durationS!)}`;
  }
}

/** The set a history row or picker shows as "the" set of a session: heaviest (then most reps), etc. */
export function topSet<T extends SetValues>(type: ExerciseType, sets: readonly T[]): T | null {
  let best: T | null = null;
  const key = (s: SetValues): [number, number] => {
    switch (type) {
      case "weight_reps":
        return [s.weightKg ?? 0, s.reps ?? 0];
      case "reps":
        return [s.reps ?? 0, 0];
      case "time":
        return [s.durationS ?? 0, 0];
      case "distance_time":
        return [s.distanceM ?? 0, -(s.durationS ?? 0)];
    }
  };
  for (const s of sets) {
    if (!isSetComplete(type, s)) continue;
    if (!best) {
      best = s;
      continue;
    }
    const [a1, a2] = key(s);
    const [b1, b2] = key(best);
    if (a1 > b1 || (a1 === b1 && a2 > b2)) best = s;
  }
  return best;
}

/** Pounds to kilograms, rounded to 0.05 kg (voice entry: "185 pounds"). */
export const lbToKg = (lb: number) => Math.round(lb * 0.45359237 * 20) / 20;
