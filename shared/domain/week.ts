// LA4 · The weekly ledger (docs/LIFE_PLAN.md "week.ts", D75–D77). Keeps the week's total when a day can't hold its
// share: what's over or under moves to the days left this week, inside per-day caps, and what still can't fit is
// forgiven. Nothing moves into next week. Pure domain logic shared by mobile and backend (D24); "today" is passed in.
//
// Numbers here are the only numbers the plan shows (D72): the AI may phrase `why` codes, never change the values.
// Constants are proposals at the domain-core gate. Changing any of them is a product decision.
import type { DayType } from "./dayType.js";
import type { Goal } from "./targets.js";

/** Calories move at most this much per day. */
export const WEEK_KCAL_MAX_SHIFT = 200;
/** …and at most this much upward when the goal is lose_fat. */
export const WEEK_KCAL_MAX_SHIFT_UP_LOSE_FAT = 150;
/** Protein shortfalls add at most this share of the day's protein base. */
export const WEEK_PROTEIN_MAX_ADD_SHARE = 0.2;
/** D86: a sick day asks for at least this share of base protein. Reaching it lets the rest go; only a shortfall
 *  below it moves to the coming days. */
export const SICK_PROTEIN_SHARE = 0.6;
/** Step shortfalls add at most this many steps a day. */
export const WEEK_STEPS_MAX_ADD = 3000;
/** A number the user picks for a day (`chosen`) can go down to this share of base for protein and steps. */
export const CHOSEN_MIN_SHARE = 0.5;
/** An event (feast) day's default allowance over base, and the most it may be over. */
export const EVENT_ALLOWANCE_KCAL = 500;
export const EVENT_ALLOWANCE_MAX_KCAL = 800;
/** Sessions per week when neither the profile nor a learned fact says (LIFE_PLAN.md, workouts). */
export const DEFAULT_SESSIONS_PER_WEEK = 3;
/** Never plan more training days in a row than this. */
export const MAX_TRAINING_STREAK = 2;

export type LedgerRule = {
  /** Takes a share of what moves. Away, travel, sick and exam days never absorb (LIFE_PLAN.md step 3). */
  absorbs: boolean;
  canTrain: boolean;
  /** Share of the step goal the day is planned at; null = no step goal. The rest moves to other days. */
  stepsFactor: number | null;
};

/** The ledger side of each day type. The tactics side (water, nudges, ranges) is dayType.ts DAY_RULES. */
export const LEDGER_RULES: Record<DayType, LedgerRule> = {
  normal: { absorbs: true, canTrain: true, stepsFactor: 1 },
  busy: { absorbs: true, canTrain: true, stepsFactor: 0.7 },
  // Away days expect "free" steps from the event, so the goal stays (there's just no step nudge).
  away: { absorbs: false, canTrain: false, stepsFactor: 1 },
  travel: { absorbs: false, canTrain: false, stepsFactor: null },
  late_work: { absorbs: true, canTrain: true, stepsFactor: 1 },
  feast: { absorbs: true, canTrain: true, stepsFactor: 1 },
  exam: { absorbs: false, canTrain: true, stepsFactor: 1 },
  sick: { absorbs: false, canTrain: false, stepsFactor: null },
  rest: { absorbs: true, canTrain: false, stepsFactor: 1 },
};

export type WhyCode =
  | "event_allowance" // this is the event day
  | "event_prebank" // lighter because of an event later this week
  | "over_spread" // lighter because of an over earlier this week
  | "under_spread" // a little more because of an under earlier this week
  | "missed_protein_spread"
  | "achievable_protein" // protein set to what this day can realistically reach
  | "chosen_target" // the user picked this day's number
  | "chosen_spread" // moved because the user picked another day's number
  | "missed_steps_spread"
  | "busy_steps_flex"
  | "away_no_steps" // goal stays, no step nudge
  | "travel_no_steps"
  | "sick_care" // maintenance, nothing moves because of it
  | "session_planned"
  | "session_moved"
  | "forgiven_kcal"
  | "forgiven_protein"
  | "forgiven_steps"
  | "forgiven_sessions";

export type DayActual = { kcal: number | null; proteinG: number | null; steps: number | null; trained: boolean };
export type DayCapacity = { kcalUp: number; kcalDown: number; proteinUp: number; stepsUp: number; canTrain: boolean };

export type DayLedgerInput = {
  date: string;
  baseKcal: number;
  baseProteinG: number;
  baseSteps: number;
  dayType: DayType;
  /**
   * Past days: null = not logged or coverage unknown → counts as on target (D77). A null metric is on target too.
   * Today: only `trained` is read (today's intake is the Gap's job).
   */
  actual: DayActual | null;
  /** Future days: what the day can realistically take, from the brief (`defaultCapacity` when there's none). */
  capacity: DayCapacity;
  /** Planned allowance for an event (feast), set from the brief before the day happens. */
  allowanceKcal?: number;
  /** What this day's meal access can reach (`achievableProteinG`); the protein base is min(base, this). */
  achievableProteinG?: number;
  /** Maintenance kcal, for a sick day (never below maintenance). */
  maintenanceKcal?: number;
  /** The user usually trains on this weekday (the learned `trains:days` fact). */
  patternDay?: boolean;
  /** Future days: numbers the user picked for this day (`chosenLimits` keeps them safe). They stay put; the rest of
   *  the week moves around them. */
  chosen?: ChosenTargets;
};

export type ChosenTargets = { kcal?: number; proteinG?: number; steps?: number };

/** Why a day's number moved: the day that caused it, and how. */
export type CauseKind =
  | "over" // a past day went over (kcal)
  | "under" // a past day came in under (kcal)
  | "event" // an event day later this week (kcal pre-banked)
  | "short" // a past day fell short (protein, steps)
  | "limited" // a day's meals can't realistically reach the target (protein)
  | "busy" // a day with less room for steps (busy, travel)
  | "missed" // a usual workout day passed without one
  | "no_room" // a usual workout day this week can't hold one
  | "chosen"; // the user picked this day's number
export type Cause = { date: string; kind: CauseKind };
/** One metric's change on a day: the usual number, the planned one, what caused it, and (for a cut) where it went. */
export type Adjust = { from: number; to: number; causes: Cause[]; movedTo?: string[] };

export type WeekDay = {
  date: string;
  /** Before today: what's counted for the day (the logged value, or its target when unlogged). */
  past: boolean;
  kcal: number;
  proteinG: number;
  /** null = no step goal today (travel, sick). */
  steps: number | null;
  train: boolean;
  why: WhyCode[];
  /** Future days whose numbers moved, for the "since Tuesday..." lines. */
  adjust?: { kcal?: Adjust; proteinG?: Adjust; steps?: Adjust; train?: { movedFrom: string[]; missed: boolean } };
  /** D85: the AI planned this day; its reason (words only), and what the guard had to change. */
  ai?: { reason: string | null; guarded: Array<"kcal" | "proteinG" | "steps" | "train"> };
  /** D86: a sick day's gentle protein minimum and the usual target. Reaching `minG` keeps the week on track. */
  sick?: { minG: number; baseG: number };
};

export type WeekPlan = {
  days: WeekDay[];
  /**
   * What couldn't be placed this week and is let go (D75). Each is `budget − (counted past + planned)`:
   * kcal > 0 is an under not made up, kcal < 0 an over let go. Protein, steps and sessions are shortfalls (≥ 0).
   */
  forgiven: { kcal: number; proteinG: number; steps: number; sessions: number };
  /**
   * The part of `forgiven` that is a realistic limit, not a miss: protein a day's meals can't reach that no other day
   * could take either, and a sick day's protein and steps. Let go quietly (no "can't fit" line).
   */
  limits: { proteinG: number; steps: number };
  /** What the days left had to make up before it was spread: kcal signed (+ eat more, − eat less), protein and steps
   *  shortfalls (≥ 0). `dayOptions` reads it for "catch up faster". */
  owed: { kcal: number; proteinG: number; steps: number };
  sessionsTarget: number;
  sessionsDone: number;
  why: WhyCode[];
};

export type WeekOptions = { goal?: Goal | null };

const DAY_MS = 86_400_000;
const dayNumber = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / DAY_MS);
};
const fromDayNumber = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** The Mon–Sun week that holds `today` (D75). */
export function weekDates(today: string): string[] {
  const n = dayNumber(today);
  const monday = n - ((new Date(n * DAY_MS).getUTCDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, i) => fromDayNumber(monday + i));
}

/** An event day's kcal: the brief's allowance (default base + 500), never under base or more than base + 800. */
export function eventAllowance(baseKcal: number, requested?: number | null): number {
  const want = requested != null && Number.isFinite(requested) ? requested : baseKcal + EVENT_ALLOWANCE_KCAL;
  return Math.round(Math.min(baseKcal + EVENT_ALLOWANCE_MAX_KCAL, Math.max(baseKcal, want)));
}

/** Sessions to aim for: the profile's answer, else the learned training days, else 3. */
export function sessionsTargetFor(sessionsPerWeek: number | null, learnedDays?: number | null): number {
  const n = sessionsPerWeek ?? learnedDays ?? DEFAULT_SESSIONS_PER_WEEK;
  return Math.max(0, Math.min(7, Math.round(n)));
}

/** Capacity for a day with no brief-specific limits: the full per-day caps, training as the day type allows. */
export function defaultCapacity(dayType: DayType, baseProteinG: number): DayCapacity {
  return {
    kcalUp: WEEK_KCAL_MAX_SHIFT,
    kcalDown: WEEK_KCAL_MAX_SHIFT,
    proteinUp: Math.round(baseProteinG * WEEK_PROTEIN_MAX_ADD_SHARE),
    stepsUp: WEEK_STEPS_MAX_ADD,
    canTrain: LEDGER_RULES[dayType].canTrain,
  };
}

const nonNeg = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

/**
 * Split a whole `amount` over slots in proportion to weight, none past its cap; whole numbers, Σ = min(amount, Σ cap).
 * Weighted water-filling, then largest remainder so the rounding never loses or invents a unit.
 */
export function spread(amount: number, slots: ReadonlyArray<{ cap: number; weight: number }>): number[] {
  const caps = slots.map((s) => nonNeg(s.cap));
  const real = slots.map(() => 0);
  let left = Math.max(0, Math.round(amount));
  let open = slots.map((_, i) => i).filter((i) => caps[i]! > 0 && slots[i]!.weight > 0);
  while (left > 1e-9 && open.length) {
    const w = open.reduce((s, i) => s + slots[i]!.weight, 0);
    const full = open.filter((i) => (left * slots[i]!.weight) / w >= caps[i]! - real[i]!);
    if (!full.length) {
      for (const i of open) real[i]! += (left * slots[i]!.weight) / w;
      left = 0;
      break;
    }
    for (const i of full) {
      left -= caps[i]! - real[i]!;
      real[i] = caps[i]!;
    }
    open = open.filter((i) => !full.includes(i));
  }
  const total = Math.round(real.reduce((a, b) => a + b, 0));
  const out = real.map((r, i) => Math.min(caps[i]!, Math.floor(r + 1e-9)));
  let short = total - out.reduce((a, b) => a + b, 0);
  const order = real.map((r, i) => ({ i, frac: r - out[i]! })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (short <= 0) break;
    if (out[i]! < caps[i]!) {
      out[i]! += 1;
      short -= 1;
    }
  }
  return out;
}

/** The range a picked number may take on a day: kcal as far as the ledger would move it (an event or sick day keeps its
 *  own range), protein and steps from half of base up to what the ledger could add. null = no step goal that day. */
export function chosenLimits(d: DayLedgerInput, floorKcal: number, goal?: Goal | null) {
  const base = Math.round(d.baseKcal);
  const up = goal === "lose_fat" ? WEEK_KCAL_MAX_SHIFT_UP_LOSE_FAT : WEEK_KCAL_MAX_SHIFT;
  let kcal: [number, number];
  if (d.allowanceKcal != null || d.dayType === "feast") kcal = [base, eventAllowance(base, base + EVENT_ALLOWANCE_MAX_KCAL)];
  else if (d.dayType === "sick") {
    const m = Math.max(base, Math.round(d.maintenanceKcal ?? base));
    kcal = [m, m + WEEK_KCAL_MAX_SHIFT];
  } else kcal = [Math.max(floorKcal, base - WEEK_KCAL_MAX_SHIFT), base + up];
  if (kcal[0] > kcal[1]) kcal = [kcal[1], kcal[1]];
  const p = Math.round(d.baseProteinG);
  const protein: [number, number] = [Math.round(p * CHOSEN_MIN_SHARE), Math.round(p * (1 + WEEK_PROTEIN_MAX_ADD_SHARE))];
  const s = Math.round(d.baseSteps);
  const steps: [number, number] | null =
    LEDGER_RULES[d.dayType].stepsFactor == null ? null : [Math.round(s * CHOSEN_MIN_SHARE), s + WEEK_STEPS_MAX_ADD];
  return { kcal, protein, steps };
}

const clampTo = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, Math.round(v)));

/** The picked numbers, made whole and kept inside `chosenLimits`; missing or broken ones are dropped. */
export function clampChosen(d: DayLedgerInput, floorKcal: number, goal?: Goal | null): ChosenTargets {
  const c = d.chosen;
  if (!c) return {};
  const lim = chosenLimits(d, floorKcal, goal);
  const ok = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const out: ChosenTargets = {};
  if (ok(c.kcal)) out.kcal = clampTo(c.kcal, lim.kcal);
  if (ok(c.proteinG)) out.proteinG = clampTo(c.proteinG, lim.protein);
  if (ok(c.steps) && lim.steps) out.steps = clampTo(c.steps, lim.steps);
  return out;
}

/** "Start fresh" (the user let go of this week's earlier gaps): days before `freshFrom` count as on target. Workouts
 *  done still count. */
export function freshLedger(input: readonly DayLedgerInput[], freshFrom: string | null | undefined): DayLedgerInput[] {
  if (!freshFrom) return [...input];
  return input.map((d) => (d.date < freshFrom && d.actual ? { ...d, actual: { kcal: null, proteinG: null, steps: null, trained: d.actual.trained } } : d));
}

type Day = DayLedgerInput & { n: number; past: boolean; event: boolean; pBase: number; pick: ChosenTargets };

/** Training days: the most sessions that fit (≤ MAX_TRAINING_STREAK in a row), then pattern days, then moves. */
function chooseSessions(days: Day[], today: number, remaining: number): { chosen: Set<number>; displaced: number[] } {
  const trainedDays = new Set(days.filter((d) => d.n <= today && d.actual?.trained).map((d) => d.n));
  const pool = days.filter(
    (d) => !d.past && !trainedDays.has(d.n) && LEDGER_RULES[d.dayType].canTrain && d.capacity.canTrain,
  );
  // Usual workout days that can't hold one: earlier this week without a session, or later with no room.
  const displaced = days.filter((d) => d.patternDay && !trainedDays.has(d.n) && !pool.includes(d)).map((d) => d.n);

  // Only runs that include a newly planned day count: a streak the user already trained is history, not a plan.
  const streakOk = (all: Set<number>, picked: Set<number>) => {
    const sorted = [...all].sort((a, b) => a - b);
    let start = 0;
    for (let i = 1; i <= sorted.length; i++) {
      if (i < sorted.length && sorted[i] === sorted[i - 1]! + 1) continue;
      const run = sorted.slice(start, i);
      if (run.length > MAX_TRAINING_STREAK && run.some((n) => picked.has(n))) return false;
      start = i;
    }
    return true;
  };
  // A moved session goes to the nearest free day to the missed one, later before earlier.
  const moveCost = (n: number) =>
    displaced.length ? Math.min(...displaced.map((m) => (n >= m ? n - m : m - n + 0.5))) : 0;

  type Pick = { set: number[]; pattern: number; cost: number; pairs: number };
  let best: Pick | null = null;
  const better = (a: Pick, b: Pick) => {
    if (a.set.length !== b.set.length) return a.set.length > b.set.length;
    if (a.pattern !== b.pattern) return a.pattern > b.pattern;
    if (a.cost !== b.cost) return a.cost < b.cost;
    if (a.pairs !== b.pairs) return a.pairs < b.pairs;
    for (let i = 0; i < a.set.length; i++) if (a.set[i] !== b.set[i]) return a.set[i]! < b.set[i]!;
    return false;
  };
  for (let mask = 0; mask < 1 << pool.length; mask++) {
    const picked = pool.filter((_, i) => mask & (1 << i));
    if (picked.length > remaining) continue;
    const set = picked.map((d) => d.n);
    const all = new Set([...trainedDays, ...set]);
    if (!streakOk(all, new Set(set))) continue;
    const pick: Pick = {
      set,
      pattern: picked.filter((d) => d.patternDay).length,
      cost: picked.filter((d) => !d.patternDay).reduce((s, d) => s + moveCost(d.n), 0),
      pairs: [...all].filter((n) => all.has(n + 1)).length,
    };
    if (!best || better(pick, best)) best = pick;
  }
  return { chosen: new Set(best?.set ?? []), displaced };
}

/**
 * The plan for the Mon–Sun week holding `today`, per metric, for the days from today to Sunday (LIFE_PLAN.md):
 * 1. remaining = Σ base − Σ counted (past) − Σ allowance (future event days); a past day with no log counts as its own
 *    target: base, or its allowance on an event day (D77).
 * 2. delta = remaining − Σ base (future non-event days).
 * 3. spread it by capacity over the days that absorb; away, travel, sick and exam days don't.
 * 4. clamp: kcal ± 200 (+150 up when losing fat) and ≥ the floor; protein starts at min(base, achievable) and adds
 *    ≤ 20% of that (it may go past what the meals give: the plan's step-up covers the rest); steps add ≤ 3,000.
 * A number the user picked for a day (`chosen`) stays put, like an event: what it leaves or takes moves to the others.
 * 5. forgive what's left. A sick day's maintenance is forgiven outright: being ill never makes other days lighter.
 * Workouts: the remaining sessions go to trainable days (see `chooseSessions`); what doesn't fit is forgiven.
 */
export function planWeek(
  input: readonly DayLedgerInput[],
  today: string,
  floorKcal: number,
  sessionsTarget: number,
  opts: WeekOptions = {},
): WeekPlan {
  const t = dayNumber(today);
  const days: Day[] = [...input]
    .map((d) => {
      const baseKcal = Math.round(d.baseKcal);
      const baseProteinG = Math.round(d.baseProteinG);
      const reach =
        d.achievableProteinG != null && Number.isFinite(d.achievableProteinG)
          ? Math.max(0, Math.min(baseProteinG, Math.round(d.achievableProteinG)))
          : baseProteinG;
      // D86: unwell, the day asks only for a gentle minimum.
      const pBase = d.dayType === "sick" ? Math.min(reach, sickMinProtein(baseProteinG)) : reach;
      const past = dayNumber(d.date) < t;
      return {
        ...d,
        baseKcal,
        baseProteinG,
        baseSteps: Math.round(d.baseSteps),
        n: dayNumber(d.date),
        past,
        event: d.allowanceKcal != null || d.dayType === "feast",
        pBase,
        pick: past ? {} : clampChosen(d, floorKcal, opts.goal),
      };
    })
    .sort((a, b) => a.n - b.n);
  const past = days.filter((d) => d.past);
  const future = days.filter((d) => !d.past);
  const why = new Map(days.map((d) => [d.n, [] as WhyCode[]]));
  const tag = (d: Day, code: WhyCode) => {
    const list = why.get(d.n)!;
    if (!list.includes(code)) list.push(code);
  };
  const weekWhy: WhyCode[] = [];

  // ── Calories ──
  const allowance = (d: Day) => eventAllowance(d.baseKcal, d.allowanceKcal);
  const countedKcal = (d: Day) => Math.round(d.actual?.kcal ?? (d.event ? allowance(d) : d.baseKcal));
  const kcal = new Map<number, number>();
  for (const d of past) kcal.set(d.n, countedKcal(d));

  const pastPart = past.reduce((s, d) => s + d.baseKcal - countedKcal(d), 0);
  let eventPart = 0;
  let chosenPart = 0;
  let sickExcess = 0;
  const absorbKcal: Day[] = [];
  for (const d of future) {
    if (d.pick.kcal != null) {
      kcal.set(d.n, d.pick.kcal);
      chosenPart += d.pick.kcal - d.baseKcal;
      tag(d, "chosen_target");
    } else if (d.event) {
      kcal.set(d.n, allowance(d));
      eventPart += allowance(d) - d.baseKcal;
      tag(d, "event_allowance");
    } else if (d.dayType === "sick") {
      const v = Math.max(d.baseKcal, Math.round(d.maintenanceKcal ?? d.baseKcal));
      kcal.set(d.n, v);
      sickExcess += v - d.baseKcal;
      tag(d, "sick_care");
    } else {
      kcal.set(d.n, d.baseKcal);
      if (LEDGER_RULES[d.dayType].absorbs) absorbKcal.push(d);
    }
  }
  const delta = pastPart - eventPart - chosenPart;
  const upCap = opts.goal === "lose_fat" ? WEEK_KCAL_MAX_SHIFT_UP_LOSE_FAT : WEEK_KCAL_MAX_SHIFT;
  const placed = spread(
    Math.abs(delta),
    absorbKcal.map((d) =>
      delta < 0
        ? {
            cap: Math.min(WEEK_KCAL_MAX_SHIFT, d.capacity.kcalDown, d.baseKcal - floorKcal),
            weight: nonNeg(d.capacity.kcalDown),
          }
        : { cap: Math.min(upCap, d.capacity.kcalUp), weight: nonNeg(d.capacity.kcalUp) },
    ),
  );
  const adjust = new Map<number, NonNullable<WeekDay["adjust"]>>();
  const adj = (d: Day) => {
    if (!adjust.has(d.n)) adjust.set(d.n, {});
    return adjust.get(d.n)!;
  };
  const chosenKcal = (sign: 1 | -1) =>
    future.filter((d) => d.pick.kcal != null && sign * (d.pick.kcal - d.baseKcal) > 0).map((d) => ({ date: d.date, kind: "chosen" as const }));
  const kcalCauses: Cause[] =
    delta > 0
      ? [...past.filter((d) => countedKcal(d) < d.baseKcal).map((d) => ({ date: d.date, kind: "under" as const })), ...chosenKcal(-1)]
      : [
          ...(eventPart > 0 ? future.filter((d) => d.event && d.pick.kcal == null).map((d) => ({ date: d.date, kind: "event" as const })) : []),
          ...(pastPart < 0 ? past.filter((d) => countedKcal(d) > d.baseKcal).map((d) => ({ date: d.date, kind: "over" as const })) : []),
          ...chosenKcal(1),
        ];
  absorbKcal.forEach((d, i) => {
    const p = placed[i]!;
    if (!p) return;
    kcal.set(d.n, d.baseKcal + (delta < 0 ? -p : p));
    adj(d).kcal = { from: d.baseKcal, to: kcal.get(d.n)!, causes: kcalCauses };
    if (delta > 0) tag(d, pastPart > 0 ? "under_spread" : "chosen_spread");
    else {
      if (eventPart > 0) tag(d, "event_prebank");
      if (pastPart < 0) tag(d, "over_spread");
      if (chosenPart > 0) tag(d, "chosen_spread");
    }
  });
  const kcalTo = absorbKcal.filter((_, i) => placed[i]).map((d) => d.date);
  for (const d of future)
    if (d.pick.kcal != null && d.pick.kcal !== d.baseKcal)
      adj(d).kcal = { from: d.baseKcal, to: d.pick.kcal, causes: [{ date: d.date, kind: "chosen" }], movedTo: kcalTo };

  // ── Protein ──
  const protein = new Map<number, number>();
  const countedProtein = (d: Day) => Math.round(d.actual?.proteinG ?? d.pBase);
  for (const d of past) protein.set(d.n, countedProtein(d));
  // A future day's starting protein: the user's pick, else what its meals can reach.
  const pStart = (d: Day) => d.pick.proteinG ?? d.pBase;
  for (const d of future) {
    protein.set(d.n, pStart(d));
    if (d.pick.proteinG != null) tag(d, "chosen_target");
    else if (d.pBase < d.baseProteinG && d.dayType !== "sick") tag(d, "achievable_protein");
  }
  // The week is short of: past days under base, protein a day's meals can't reach (a long session, the mess), and days
  // the user set lower. They move to days that can take more (a day set higher pays some of it back); a sick day's
  // gentle minimum is let go outright (D86): only what a past sick day fell short of that minimum moves on.
  const sickDay = (d: Day) => d.dayType === "sick" && d.pick.proteinG == null;
  const sickProtein = days.filter(sickDay).reduce((s, d) => s + d.baseProteinG - d.pBase, 0);
  const owedBase = (d: Day) => (sickDay(d) ? d.pBase : d.baseProteinG);
  const limitedDays = days.filter((d) => d.dayType !== "sick" && d.pick.proteinG == null && d.pBase < d.baseProteinG);
  const structural = limitedDays.reduce((s, d) => s + d.baseProteinG - d.pBase, 0);
  const proteinShort = Math.max(
    0,
    past.reduce((s, d) => s + owedBase(d) - countedProtein(d), 0) +
      future
        .filter((d) => d.dayType !== "sick" || d.pick.proteinG != null)
        .reduce((s, d) => s + d.baseProteinG - pStart(d), 0),
  );
  const absorbProtein = future.filter((d) => LEDGER_RULES[d.dayType].absorbs && d.pick.proteinG == null);
  const proteinAdds = spread(
    proteinShort,
    absorbProtein.map((d) => ({
      cap: Math.min(Math.floor(d.pBase * WEEK_PROTEIN_MAX_ADD_SHARE), d.capacity.proteinUp),
      weight: nonNeg(d.capacity.proteinUp),
    })),
  );
  const proteinCauses: Cause[] = [
    ...past.filter((d) => countedProtein(d) < d.pBase).map((d) => ({ date: d.date, kind: "short" as const })),
    ...limitedDays.map((d) => ({ date: d.date, kind: "limited" as const })),
    ...future
      .filter((d) => d.pick.proteinG != null && d.pick.proteinG < d.baseProteinG)
      .map((d) => ({ date: d.date, kind: "chosen" as const })),
  ];
  const proteinTo: string[] = [];
  absorbProtein.forEach((d, i) => {
    if (!proteinAdds[i]) return;
    protein.set(d.n, d.pBase + proteinAdds[i]!);
    // A day short of base by its own meals keeps that cause: it's taking back part of its own gap (the step-up covers it).
    adj(d).proteinG = { from: d.pBase, to: d.pBase + proteinAdds[i]!, causes: proteinCauses.filter((c) => c.date !== d.date || c.kind === "limited") };
    proteinTo.push(d.date);
    tag(d, "missed_protein_spread");
  });
  for (const d of future)
    if (d.pick.proteinG != null) {
      if (d.pick.proteinG !== d.baseProteinG)
        adj(d).proteinG = { from: d.baseProteinG, to: d.pick.proteinG, causes: [{ date: d.date, kind: "chosen" }], movedTo: proteinTo };
    } else if (d.pBase < d.baseProteinG && !sickDay(d) && !adjust.get(d.n)?.proteinG)
      adj(d).proteinG = { from: d.baseProteinG, to: d.pBase, causes: [{ date: d.date, kind: "limited" }], movedTo: proteinTo };
  const proteinPlaced = proteinAdds.reduce((a, b) => a + b, 0);

  // ── Steps ──
  const steps = new Map<number, number | null>();
  const countedSteps = (d: Day) => Math.round(d.actual?.steps ?? d.baseSteps);
  for (const d of past) steps.set(d.n, countedSteps(d));
  let stepsShort = past.reduce((s, d) => s + d.baseSteps - countedSteps(d), 0);
  let sickSteps = 0;
  const absorbSteps: Day[] = [];
  for (const d of future) {
    const factor = LEDGER_RULES[d.dayType].stepsFactor;
    if (d.pick.steps != null) {
      steps.set(d.n, d.pick.steps);
      stepsShort += d.baseSteps - d.pick.steps;
      tag(d, "chosen_target");
      continue;
    }
    const target = factor == null ? 0 : Math.round(d.baseSteps * factor);
    steps.set(d.n, factor == null ? null : target);
    if (d.dayType === "sick") sickSteps += d.baseSteps - target;
    else stepsShort += d.baseSteps - target;
    if (d.dayType === "away") tag(d, "away_no_steps");
    if (d.dayType === "travel") tag(d, "travel_no_steps");
    if (factor != null && factor < 1) tag(d, "busy_steps_flex");
    if (LEDGER_RULES[d.dayType].absorbs && factor === 1) absorbSteps.push(d);
  }
  stepsShort = Math.max(0, stepsShort);
  const stepAdds = spread(
    stepsShort,
    absorbSteps.map((d) => ({
      cap: Math.min(WEEK_STEPS_MAX_ADD, d.capacity.stepsUp),
      weight: nonNeg(d.capacity.stepsUp),
    })),
  );
  const stepCauses: Cause[] = [
    ...past.filter((d) => countedSteps(d) < d.baseSteps).map((d) => ({ date: d.date, kind: "short" as const })),
    ...future
      .filter((d) => d.pick.steps != null && d.pick.steps < d.baseSteps)
      .map((d) => ({ date: d.date, kind: "chosen" as const })),
    ...future
      .filter((d) => d.dayType !== "sick" && LEDGER_RULES[d.dayType].stepsFactor !== 1)
      .map((d) => ({ date: d.date, kind: "busy" as const })),
  ];
  const stepsTo: string[] = [];
  absorbSteps.forEach((d, i) => {
    if (!stepAdds[i]) return;
    steps.set(d.n, (steps.get(d.n) ?? 0) + stepAdds[i]!);
    adj(d).steps = { from: d.baseSteps, to: steps.get(d.n)!, causes: stepCauses };
    stepsTo.push(d.date);
    tag(d, "missed_steps_spread");
  });
  for (const d of future) {
    const s = steps.get(d.n);
    if (d.pick.steps != null) {
      if (d.pick.steps !== d.baseSteps)
        adj(d).steps = { from: d.baseSteps, to: d.pick.steps, causes: [{ date: d.date, kind: "chosen" }], movedTo: stepsTo };
    } else if (d.dayType !== "sick" && s != null && s < d.baseSteps)
      adj(d).steps = { from: d.baseSteps, to: s, causes: [{ date: d.date, kind: "busy" }], movedTo: stepsTo };
  }
  const stepsPlaced = stepAdds.reduce((a, b) => a + b, 0);

  // ── Workouts ──
  const sessionsDone = days.filter((d) => d.n <= t && d.actual?.trained).length;
  const remaining = Math.max(0, sessionsTarget - sessionsDone);
  const { chosen, displaced } = chooseSessions(days, t, remaining);
  const byN = new Map(days.map((d) => [d.n, d]));
  const usedFrom = new Set<number>();
  for (const d of future) {
    if (!chosen.has(d.n)) continue;
    // A session on a day that isn't a usual one stands in for the nearest usual day that couldn't hold it.
    const from = d.patternDay
      ? undefined
      : displaced.filter((m) => !usedFrom.has(m)).sort((a, b) => Math.abs(a - d.n) - Math.abs(b - d.n))[0];
    if (from != null) {
      usedFrom.add(from);
      adj(d).train = { movedFrom: [byN.get(from)!.date], missed: from < t };
      tag(d, "session_moved");
    } else tag(d, "session_planned");
  }

  // ── Forgiven ──
  const budgetKcal = days.reduce((s, d) => s + d.baseKcal, 0);
  const plannedKcal = days.reduce((s, d) => s + kcal.get(d.n)!, 0);
  const proteinUnplaced = proteinShort - proteinPlaced;
  const forgiven = {
    kcal: budgetKcal - plannedKcal,
    proteinG: proteinUnplaced + sickProtein,
    steps: stepsShort - stepsPlaced + sickSteps,
    sessions: remaining - chosen.size,
  };
  const limits = { proteinG: Math.min(proteinUnplaced, structural) + sickProtein, steps: sickSteps };
  // A sick day's maintenance is in forgiven.kcal too, but it's care, not something that "couldn't fit".
  if (forgiven.kcal + sickExcess !== 0) weekWhy.push("forgiven_kcal");
  if (forgiven.proteinG - limits.proteinG > 0) weekWhy.push("forgiven_protein");
  if (stepsShort - stepsPlaced > 0) weekWhy.push("forgiven_steps");
  if (forgiven.sessions > 0) weekWhy.push("forgiven_sessions");

  return {
    days: days.map((d) => ({
      date: d.date,
      past: d.past,
      kcal: kcal.get(d.n)!,
      proteinG: protein.get(d.n)!,
      steps: steps.get(d.n) ?? null,
      train: d.past || (d.n === t && d.actual?.trained) ? Boolean(d.actual?.trained) : chosen.has(d.n),
      why: why.get(d.n)!,
      ...(adjust.get(d.n) && !d.past ? { adjust: adjust.get(d.n)! } : {}),
      ...(sickDay(d) ? { sick: { minG: d.pBase, baseG: d.baseProteinG } } : {}),
    })),
    forgiven,
    limits,
    owed: { kcal: delta, proteinG: proteinShort, steps: stepsShort },
    sessionsTarget,
    sessionsDone,
    why: weekWhy,
  };
}

/** D86: a sick day's protein minimum, before what its meals can reach. */
export const sickMinProtein = (baseProteinG: number) => Math.round(baseProteinG * SICK_PROTEIN_SHARE);

/** One way to set a day's numbers. null steps = no step goal that day. */
export type DayOption = { kcal: number; proteinG: number; steps: number | null };
export type DayOptions = {
  /** The usual numbers (base), as if nothing earlier needed making up. */
  usual: DayOption;
  /** Keep the week's average, shared over the days left: the plan's own numbers. */
  even: DayOption;
  /** Catch up faster: this day takes as much of what's owed as a picked number may. null when it's no different. */
  faster: DayOption | null;
};

/**
 * The choices offered when planning a day ("Usual 135 g · Plan A 144 g · Plan B 150 g"). `week` is the plan made
 * without a pick for this day; `row` is this day's ledger row.
 */
export function dayOptions(week: WeekPlan, row: DayLedgerInput, floorKcal: number, goal?: Goal | null): DayOptions {
  const wd = week.days.find((d) => d.date === row.date);
  const factor = LEDGER_RULES[row.dayType].stepsFactor;
  const base = { kcal: Math.round(row.baseKcal), proteinG: Math.round(row.baseProteinG), steps: Math.round(row.baseSteps) };
  const usual: DayOption = { kcal: base.kcal, proteinG: base.proteinG, steps: factor == null ? null : base.steps };
  const even: DayOption = wd ? { kcal: wd.kcal, proteinG: wd.proteinG, steps: wd.steps } : usual;
  const event = row.allowanceKcal != null || row.dayType === "feast";
  if (!wd || wd.past || !LEDGER_RULES[row.dayType].absorbs) return { usual, even, faster: null };

  const lim = chosenLimits(row, floorKcal, goal);
  const { owed } = week;
  const kcal = event
    ? even.kcal
    : owed.kcal > 0
      ? Math.max(even.kcal, Math.min(lim.kcal[1], base.kcal + owed.kcal))
      : owed.kcal < 0
        ? Math.min(even.kcal, Math.max(lim.kcal[0], base.kcal + owed.kcal))
        : even.kcal;
  const pBase = Math.min(base.proteinG, Math.round(row.achievableProteinG ?? Infinity));
  const proteinG = Math.max(even.proteinG, Math.min(lim.protein[1], pBase + owed.proteinG));
  const steps =
    even.steps != null && factor === 1 && lim.steps ? Math.max(even.steps, Math.min(lim.steps[1], base.steps + owed.steps)) : even.steps;
  const faster: DayOption = { kcal, proteinG, steps };
  const same = faster.kcal === even.kcal && faster.proteinG === even.proteinG && faster.steps === even.steps;
  return { usual, even, faster: same ? null : faster };
}
