// LA2/LA3 · Standing life and day facts (docs/LIFE_PLAN.md, D72–D74). Pure domain logic shared by mobile and backend
// (D24). The brief is parsed by AI into `DayFacts` (D72); `validateDayFacts` is the gate between that JSON and the
// planner, so it accepts anything and never throws. Times are minutes since local midnight.
//
// Constants are proposals at the domain-core gate (LIFE_PLAN.md). Changing any of them is a product decision.
import type { MealType } from "./food.js";

export type MealSource = "home_self" | "home_family" | "mess" | "canteen" | "eat_out" | "mixed";
export type BudgetBand = "comfortable" | "careful" | "tight";
export type WorkPattern = "office" | "shifts" | "student" | "wfh" | "irregular";

/** The `profiles` columns for standing life. null = not answered (every onboarding question has "Skip"). */
export type Standing = {
  mealSource: MealSource | null;
  budget: BudgetBand | null;
  workPattern: WorkPattern | null;
  hasKitchen: boolean | null;
  hasFridge: boolean | null;
  /** 0–7; null = learn from logs. */
  sessionsPerWeek: number | null;
};

export const EMPTY_STANDING: Standing = {
  mealSource: null,
  budget: null,
  workPattern: null,
  hasKitchen: null,
  hasFridge: null,
  sessionsPerWeek: null,
};

export const BLOCK_KINDS = ["work", "travel", "event", "social", "study", "sleep", "other"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
export type Block = { from: number; to: number; kind: BlockKind; label?: string; canEat?: boolean; canMove?: boolean };

export const MEAL_ACCESS = ["home", "mess", "canteen", "eat_out", "packed", "event_food", "unknown"] as const;
export type MealAccess = (typeof MEAL_ACCESS)[number];

export const WHEREABOUTS = ["home", "away_local", "travelling", "other_city"] as const;
export type Whereabouts = (typeof WHEREABOUTS)[number];

export const DAY_FLAGS = ["sick", "exam", "fasting", "feast", "rest_day", "no_gym_access"] as const;
export type DayFlag = (typeof DAY_FLAGS)[number];

/** The structured brief. Minutes since local midnight; `to` may exceed 1440 for past-midnight blocks. */
export type DayFacts = {
  blocks: Block[];
  whereabouts: Whereabouts;
  mealAccess: Partial<Record<MealType, MealAccess>>;
  wakeMinute?: number;
  sleepMinute?: number;
  flags: DayFlag[];
  /** Numbers the user picked for the day when planning it (Plan A/B or their own). Absent = follow the week. The
   *  planner keeps them inside safe limits (week.ts `chosenLimits`). */
  targets?: { kcal?: number; proteinG?: number; steps?: number };
};

export type Window = { from: number; to: number };

export const DAY_MINUTES = 1440;
/** Blocks may run past midnight, but never more than a day past it. */
export const MAX_MINUTE = 2 * DAY_MINUTES;
/** A block shorter than this (after trimming an overlap) is dropped. */
export const MIN_BLOCK_MINUTES = 10;
export const MAX_BLOCKS = 12;
export const MAX_LABEL_LENGTH = 60;
/** Used when neither the brief nor a learned fact gives wake or sleep. */
export const DEFAULT_WAKE_MINUTE = 7 * 60;
export const DEFAULT_SLEEP_MINUTE = 23 * 60;
/** Nothing that moves the body is placed after this (same line as moveOptions.ts LATE_NIGHT_MINUTE, D57). */
export const LATE_MOVE_MINUTE = 21 * 60 + 30;
/** A workout needs a free window this much longer than the routine (LIFE_PLAN.md, workouts). */
export const TRAIN_BUFFER_MINUTES = 15;

const SLOTS: readonly MealType[] = ["breakfast", "lunch", "snack", "dinner"];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function cleanBlock(v: unknown): Block | null {
  if (!isObj(v) || !isNum(v.from) || !isNum(v.to)) return null;
  const from = clamp(Math.round(v.from), 0, DAY_MINUTES);
  let to = Math.round(v.to);
  // "22:00–01:00" written as 1320–60: the block runs past midnight.
  if (to < from) to += DAY_MINUTES;
  to = clamp(to, from, Math.min(MAX_MINUTE, from + DAY_MINUTES));
  if (to - from < MIN_BLOCK_MINUTES) return null;
  const out: Block = { from, to, kind: oneOf(BLOCK_KINDS, v.kind) ? v.kind : "other" };
  if (typeof v.label === "string" && v.label.trim()) out.label = v.label.trim().slice(0, MAX_LABEL_LENGTH);
  if (typeof v.canEat === "boolean") out.canEat = v.canEat;
  if (typeof v.canMove === "boolean") out.canMove = v.canMove;
  return out;
}

/**
 * Make parsed brief JSON safe for the planner: unknown values dropped, times rounded and clamped, blocks sorted, an
 * overlapping block trimmed to start where the previous one ends (dropped if what's left is too short), wake before
 * sleep. Accepts anything and never throws; garbage in gives an empty usual day.
 */
export function validateDayFacts(f: unknown): DayFacts {
  const o = isObj(f) ? f : {};

  const raw = (Array.isArray(o.blocks) ? o.blocks : []).map(cleanBlock).filter((b): b is Block => b !== null);
  // Earlier start first; on a tie the longer block wins.
  raw.sort((a, b) => a.from - b.from || b.to - a.to);
  const blocks: Block[] = [];
  for (const b of raw) {
    const prev = blocks[blocks.length - 1];
    if (prev && b.from < prev.to) {
      if (b.to - prev.to < MIN_BLOCK_MINUTES) continue;
      b.from = prev.to;
    }
    blocks.push(b);
    if (blocks.length >= MAX_BLOCKS) break;
  }

  const mealAccess: DayFacts["mealAccess"] = {};
  if (isObj(o.mealAccess))
    for (const slot of SLOTS) {
      const a = o.mealAccess[slot];
      if (oneOf(MEAL_ACCESS, a)) mealAccess[slot] = a;
    }

  const flags = Array.isArray(o.flags) ? [...new Set(o.flags.filter((x): x is DayFlag => oneOf(DAY_FLAGS, x)))] : [];

  const out: DayFacts = {
    blocks,
    whereabouts: oneOf(WHEREABOUTS, o.whereabouts) ? o.whereabouts : "home",
    mealAccess,
    flags,
  };
  if (isNum(o.wakeMinute)) out.wakeMinute = clamp(Math.round(o.wakeMinute), 0, DAY_MINUTES - 1);
  if (isNum(o.sleepMinute)) {
    let sleep = Math.round(o.sleepMinute);
    const wake = out.wakeMinute ?? DEFAULT_WAKE_MINUTE;
    // "Sleep at 1" means 01:00 after midnight.
    if (sleep <= wake) sleep += DAY_MINUTES;
    if (sleep > wake && sleep <= MAX_MINUTE) out.sleepMinute = sleep;
  }
  if (isObj(o.targets)) {
    const t: NonNullable<DayFacts["targets"]> = {};
    for (const k of ["kcal", "proteinG", "steps"] as const) {
      const v = o.targets[k];
      if (isNum(v) && v > 0) t[k] = Math.round(v);
    }
    if (Object.keys(t).length) out.targets = t;
  }
  return out;
}

/** Free time between wake and sleep that no block covers, in time order. Blocks are assumed validated. */
export function freeWindows(f: DayFacts, wake: number, sleep: number): Window[] {
  const busy = [...f.blocks].sort((a, b) => a.from - b.from);
  const out: Window[] = [];
  let cursor = wake;
  for (const b of busy) {
    if (b.to <= cursor) continue;
    if (b.from >= sleep) break;
    if (b.from > cursor) out.push({ from: cursor, to: b.from });
    cursor = Math.max(cursor, b.to);
  }
  if (cursor < sleep) out.push({ from: cursor, to: sleep });
  return out;
}

/** Wake and sleep for the day: the brief's own times, else the caller's learned ones, else the defaults. */
export function dayBounds(f: DayFacts, learned?: { wakeMinute?: number; sleepMinute?: number }): Window {
  const from = f.wakeMinute ?? learned?.wakeMinute ?? DEFAULT_WAKE_MINUTE;
  const to = f.sleepMinute ?? learned?.sleepMinute ?? DEFAULT_SLEEP_MINUTE;
  return to > from ? { from, to } : { from, to: from + 1 };
}

export const freeMinutes = (windows: readonly Window[]) => windows.reduce((s, w) => s + (w.to - w.from), 0);

/** A window that fits a routine of `minutes` (+ the buffer) and finishes by LATE_MOVE_MINUTE, or null. */
export function trainingWindow(windows: readonly Window[], minutes: number): Window | null {
  const need = minutes + TRAIN_BUFFER_MINUTES;
  for (const w of windows) {
    const end = Math.min(w.to, LATE_MOVE_MINUTE);
    if (end - w.from >= need) return { from: w.from, to: end };
  }
  return null;
}
