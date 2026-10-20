// LA2 · Classify the day (docs/LIFE_PLAN.md "dayType.ts", D72). Pure domain logic shared by mobile and backend (D24).
// The day type decides tactics (this file) and how much the day can absorb in the weekly ledger (week.ts LEDGER_RULES).
// Runtime code here imports nothing from other domain files, the same as the rest of shared/domain.
//
// Constants are proposals at the domain-core gate. Changing any of them is a product decision.
import type { DayFacts, Standing } from "./life.js";

export const DAY_TYPES = ["normal", "busy", "away", "travel", "late_work", "feast", "exam", "sick", "rest"] as const;
export type DayType = (typeof DAY_TYPES)[number];

/** Away: this many minutes out (event or travel blocks) during the day. */
export const AWAY_MINUTES = 5 * 60;
/** Travel: this many minutes in travel blocks, even when whereabouts didn't say "travelling". */
export const TRAVEL_MINUTES = 3 * 60;
/** Late work: a work block that ends after this minute. */
export const LATE_WORK_MINUTE = 21 * 60;
/** Busy: less free time than this between wake and sleep. */
export const BUSY_FREE_MINUTES = 3 * 60;
/** Busy: this much time in blocks outside the routine (not work or study: a long session, errands, social). */
export const BUSY_BLOCK_MINUTES = 5 * 60;

// Same defaults as life.ts (DEFAULT_WAKE_MINUTE / DEFAULT_SLEEP_MINUTE); kept local so this file has no runtime imports.
const WAKE = 7 * 60;
const SLEEP = 23 * 60;

const blockMinutes = (f: DayFacts, kinds: readonly string[]) =>
  f.blocks.filter((b) => kinds.includes(b.kind)).reduce((s, b) => s + (b.to - b.from), 0);

/** Minutes between wake and sleep not covered by any block (blocks may overlap here; they're merged). */
function freeTime(f: DayFacts): number {
  const wake = f.wakeMinute ?? WAKE;
  const sleep = f.sleepMinute && f.sleepMinute > wake ? f.sleepMinute : Math.max(SLEEP, wake + 1);
  let busy = 0;
  let cursor = wake;
  for (const b of [...f.blocks].sort((a, b) => a.from - b.from)) {
    const from = Math.max(b.from, cursor);
    const to = Math.min(b.to, sleep);
    if (to > from) {
      busy += to - from;
      cursor = to;
    }
  }
  return sleep - wake - busy;
}

/** Slot for a block's start, as mealTypeForTime (food.ts): breakfast < 11:00, lunch < 15:30, snack < 18:30. */
const slotAt = (m: number) => (m < 660 ? "breakfast" : m < 930 ? "lunch" : m < 1110 ? "snack" : "dinner");

/**
 * First match wins: sick flag → sick; travelling (or ≥ 3 h of travel blocks) → travel; feast flag, or a social block
 * where you eat and that slot's access is event food → feast; another city, or ≥ 5 h of event/travel blocks → away; a
 * work or study block ending after 21:00 → late_work; exam flag → exam; rest_day flag → rest; under 3 h free, or ≥ 5 h
 * of non-routine blocks → busy; else normal.
 *
 * A client dinner (social, eat_out) is not a feast, so "expo 1–7, client dinner at 8" stays an away day (LA2 exit).
 * `standing` is part of the contract for later rules (e.g. shift work); the v1 rules don't read it.
 */
export function classifyDay(f: DayFacts, standing: Standing): DayType {
  void standing;
  const has = (flag: DayFacts["flags"][number]) => f.flags.includes(flag);
  if (has("sick")) return "sick";
  if (f.whereabouts === "travelling" || blockMinutes(f, ["travel"]) >= TRAVEL_MINUTES) return "travel";
  if (
    has("feast") ||
    f.blocks.some((b) => b.kind === "social" && b.canEat === true && f.mealAccess[slotAt(b.from)] === "event_food")
  )
    return "feast";
  if (f.whereabouts === "other_city" || blockMinutes(f, ["event", "travel"]) >= AWAY_MINUTES) return "away";
  if (f.blocks.some((b) => (b.kind === "work" || b.kind === "study") && b.to > LATE_WORK_MINUTE)) return "late_work";
  if (has("exam")) return "exam";
  if (has("rest_day")) return "rest";
  if (freeTime(f) < BUSY_FREE_MINUTES || blockMinutes(f, ["other", "social"]) >= BUSY_BLOCK_MINUTES) return "busy";
  return "normal";
}

export type ProteinTactic = "base" | "front_load" | "portable" | "early" | "easy_access" | "gentle";
export type WorkoutTactic = "patterned" | "if_window" | "move" | "morning_or_move" | "optional" | "none";
export type WaterTactic = "through_day" | "top_up_gaps" | "carry_bottle" | "raised";
export type NudgeTactic =
  "usual" | "free_windows" | "prep_and_morning" | "prep_only" | "none_after_work" | "none_at_event" | "minimal" | "care_only";

export type DayRule = {
  /** kcal shown as a range of ± this around the day's ledger value (0 = a single number). */
  kcalRange: number;
  /** Target maintenance instead of the goal's deficit or surplus. */
  maintenance: boolean;
  protein: ProteinTactic;
  /** A step nudge may be sent. Away days expect "free" steps, so there's no nudge but the goal stays. */
  stepNudge: boolean;
  workout: WorkoutTactic;
  water: WaterTactic;
  nudges: NudgeTactic;
  /** Walks are placed in free windows before this minute (null = LATE_MOVE_MINUTE). */
  latestWalkMinute: number | null;
};

/** What each day type changes (LIFE_PLAN.md table). The ledger side (absorbing, step factor) is week.ts LEDGER_RULES. */
export const DAY_RULES: Record<DayType, DayRule> = {
  normal: { kcalRange: 0, maintenance: false, protein: "base", stepNudge: true, workout: "patterned", water: "through_day", nudges: "usual", latestWalkMinute: null },
  busy: { kcalRange: 0, maintenance: false, protein: "base", stepNudge: true, workout: "if_window", water: "top_up_gaps", nudges: "free_windows", latestWalkMinute: null },
  away: { kcalRange: 200, maintenance: false, protein: "front_load", stepNudge: false, workout: "move", water: "carry_bottle", nudges: "prep_and_morning", latestWalkMinute: null },
  travel: { kcalRange: 200, maintenance: true, protein: "portable", stepNudge: false, workout: "move", water: "carry_bottle", nudges: "prep_only", latestWalkMinute: null },
  late_work: { kcalRange: 0, maintenance: false, protein: "base", stepNudge: true, workout: "morning_or_move", water: "through_day", nudges: "none_after_work", latestWalkMinute: 21 * 60 + 30 },
  feast: { kcalRange: 0, maintenance: false, protein: "early", stepNudge: true, workout: "optional", water: "through_day", nudges: "none_at_event", latestWalkMinute: 21 * 60 + 30 },
  exam: { kcalRange: 0, maintenance: false, protein: "easy_access", stepNudge: false, workout: "optional", water: "through_day", nudges: "minimal", latestWalkMinute: null },
  sick: { kcalRange: 0, maintenance: true, protein: "gentle", stepNudge: false, workout: "none", water: "raised", nudges: "care_only", latestWalkMinute: null },
  rest: { kcalRange: 0, maintenance: false, protein: "base", stepNudge: true, workout: "none", water: "through_day", nudges: "usual", latestWalkMinute: null },
};
