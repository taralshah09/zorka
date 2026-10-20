// LA3 · Plan the day (docs/LIFE_PLAN.md "planDay.ts", D72, D79). Feasibility first, then optimise inside it: classify the
// day, find its free windows, let the weekly ledger set today's share, then place meals, a workout, a walk and prep
// inside free time. Runs on the phone, offline once the brief is parsed; every number comes from code.
// Pure domain logic shared by mobile and backend (D24); "today" is passed in.
//
// Constants are proposals at the LA3 gate. Changing any of them is a product decision.
import { classifyDay, DAY_RULES, type DayType } from "./dayType.js";
import {
  accessForSource,
  achievableProteinG,
  proteinStepUp,
  rankEatOptions,
  type EatCandidate,
  type ProteinStaple,
  type ProteinStepUp,
  type RankedOption,
  usableStaples,
} from "./eatOptions.js";
import type { Diet, MealType } from "./food.js";
import {
  dayBounds,
  freeWindows,
  LATE_MOVE_MINUTE,
  trainingWindow,
  type Block,
  type DayFacts,
  type MealAccess,
  type Standing,
  type Window,
} from "./life.js";
import { applyGuarded, guardAiWeek, type AiWeek, type GuardedWeek } from "./aiPlan.js";
import { dayKindOf, weekdayOf, type ActiveFacts } from "./memory.js";
import type { Goal } from "./targets.js";
import {
  dayOptions,
  defaultCapacity,
  eventAllowance,
  LEDGER_RULES,
  planWeek,
  type DayLedgerInput,
  type DayOptions,
  type WeekPlan,
  type WhyCode,
} from "./week.js";

export type Slot = MealType;

export type PlanItem =
  | { kind: "meal"; slot: Slot; at: number; title: string; access: MealAccess; options: RankedOption[]; usual: boolean }
  | { kind: "workout"; at: number; routineId: string; name: string; minutes: number }
  | { kind: "walk"; at: number; minutes: number }
  /** dayOffset -1 = the evening before (shown on the previous day and sent as that night's prep nudge). */
  | { kind: "prep"; at: number; dayOffset: -1 | 0; text: string };

export type PlanWhy = WhyCode | "assumed_day" | "event_food" | "lunch_walk" | "no_window_for_workout";

export type DayPlan = {
  date: string;
  dayType: DayType;
  /** No brief: an assumed usual day (D79). */
  assumed: boolean;
  targets: { kcal: number; kcalRange?: [number, number]; proteinG: number; steps: number | null; waterGlasses: number };
  /** Realistic protein for this day's meal access, and the cheap step up when that's under the day's target. */
  protein: { achievableG: number; stepUp: ProteinStepUp | null };
  /** The numbers the user can pick for this day (usual, keep the week even, catch up faster), made without their pick. */
  options: DayOptions;
  /** Sorted by time; every item that takes time is inside a free window and nothing moves after 21:30. */
  items: PlanItem[];
  why: PlanWhy[];
  week: WeekPlan;
  /** D85: "ai" when the model's week (guarded) set the numbers, "code" for the rules-only plan (no AI, or offline). */
  source: "ai" | "code";
  /** The guard's report when the AI planned: metrics that fell back to the code plan, and the model's summary. */
  ai?: { fellBack: GuardedWeek["fellBack"]; summary: string | null };
};

export type RoutineSummary = { id: string; name: string; minutes: number };

export type PlanDayInput = {
  date: string;
  /** The real current date (the ledger counts days before it as past). */
  today: string;
  /** Minute of the day now when planning today (earlier items are left out); 0 for a future day. */
  now: number;
  base: { kcal: number; proteinG: number; steps: number; floorKcal: number; waterGlasses: number; goal: Goal | null; maintenanceKcal?: number };
  standing: Standing;
  /** The confirmed brief; null = no brief, plan an assumed usual day (D79). */
  facts: DayFacts | null;
  patterns: ActiveFacts;
  /** The Mon–Sun week holding `date`. This date's dayType and capacity are worked out here. */
  ledger: DayLedgerInput[];
  /** The next routine first. */
  routines: RoutineSummary[];
  candidates: EatCandidate[];
  diet: Diet;
  staples: readonly ProteinStaple[];
  sessionsTarget: number;
  /** Event allowance from the brief (a wedding), kcal for the day; default base + 500. */
  allowanceKcal?: number;
  /** D85: the model's proposed week (raw); guarded here every time. null/undefined = the code plan. */
  ai?: AiWeek | null;
};

/** Default meal times when there's no learned usual time. */
export const SLOT_MINUTE: Record<Slot, number> = { breakfast: 8 * 60 + 30, lunch: 13 * 60 + 30, snack: 17 * 60, dinner: 20 * 60 + 30 };
/** Share of the day's targets each meal aims for. Away days front-load protein at breakfast. */
export const SLOT_SHARE: Record<Slot, number> = { breakfast: 0.25, lunch: 0.35, snack: 0.1, dinner: 0.3 };
export const FRONT_LOAD_BREAKFAST_SHARE = 0.4;
/** Minutes a meal, a walk and water take in the plan. */
export const MEAL_MINUTES = 20;
export const MIN_WALK_MINUTES = 10;
export const MAX_WALK_MINUTES = 60;
/** A late-work day gets a walk at lunch instead of the evening (LIFE_PLAN.md scenario 2). */
export const LUNCH_WALK_MINUTE = 13 * 60 + 15;
export const LUNCH_WALK_MINUTES = 20;
export const STEPS_PER_WALK_MINUTE = 100;
/** Prep the evening before an away or travel day, and this long before leaving. */
export const PREP_EVENING_MINUTE = 21 * 60 + 30;
export const PREP_BEFORE_LEAVING = 30;
/** Leaving for an event or trip this long before it starts. */
export const LEAVE_BEFORE_MINUTES = 15;
/** What to pack for an away or travel day, first usable wins (light, cheap, survives a bag). */
export const PACK_ORDER: readonly string[] = ["chana_30", "peanuts_30", "eggs_2", "sattu_40", "whey_1"];
/** Sick days raise the water goal by this many glasses (DAY_RULES.sick water "raised"). */
export const SICK_EXTRA_GLASSES = 2;
/** Assumed blocks for an assumed weekday, by work pattern (D79: the plan says it assumed). */
export const ASSUMED_WEEKDAY_BLOCK: Partial<Record<NonNullable<Standing["workPattern"]>, Block>> = {
  office: { from: 9 * 60 + 30, to: 18 * 60, kind: "work", label: "Work (assumed)" },
  student: { from: 9 * 60, to: 16 * 60, kind: "study", label: "Classes (assumed)" },
};

const SLOTS: readonly Slot[] = ["breakfast", "lunch", "snack", "dinner"];
const SLOT_LABEL: Record<Slot, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner" };

/** An assumed usual day: the work pattern's hours on a weekday, meal access from the standing meal source. */
export function assumedFacts(date: string, standing: Standing, patterns: ActiveFacts): DayFacts {
  const weekday = dayKindOf(date) === "weekday";
  const block = weekday && standing.workPattern ? ASSUMED_WEEKDAY_BLOCK[standing.workPattern] : undefined;
  const access = accessForSource(standing.mealSource);
  const f: DayFacts = {
    blocks: block ? [{ ...block }] : [],
    whereabouts: "home",
    mealAccess: access === "unknown" ? {} : { breakfast: access, lunch: access, snack: access, dinner: access },
    flags: [],
  };
  if (patterns.firstMealMinute != null) f.wakeMinute = Math.max(5 * 60, patterns.firstMealMinute - 60);
  return f;
}

/** Busy time already taken by placed items, so two items don't overlap. */
class Calendar {
  private taken: Window[] = [];
  constructor(private windows: Window[]) {}

  /** The free start nearest `want` (later first, then earlier) where `minutes` fit before `latest`; null if none. */
  place(want: number, minutes: number, latest = Infinity): number | null {
    let best: number | null = null;
    for (const w of this.windows) {
      const end = Math.min(w.to, latest);
      for (let at = w.from; at + minutes <= end; at += 5) {
        if (this.taken.some((t) => at < t.to && at + minutes > t.from)) continue;
        if (best == null || Math.abs(at - want) < Math.abs(best - want) || (Math.abs(at - want) === Math.abs(best - want) && at > best))
          best = at;
      }
    }
    if (best != null) this.taken.push({ from: best, to: best + minutes });
    return best;
  }

  /** A reminder (no duration): `want` if it's free time, else the nearest free minute before the block it's in. */
  remind(want: number): number | null {
    if (this.windows.some((w) => want >= w.from && want < w.to)) return want;
    const before = this.windows.filter((w) => w.to <= want).at(-1);
    return before ? before.to - 1 : null;
  }
}

const roundTo5 = (n: number) => Math.round(n / 5) * 5;
/** People eat at work and college, so those blocks hold a meal unless the brief says otherwise; others need canEat. */
export const canEatIn = (b: Block) => b.canEat ?? (b.kind === "work" || b.kind === "study");

export function planDay(input: PlanDayInput): DayPlan {
  const { date, standing, patterns, base } = input;
  const assumed = input.facts == null;
  const facts = input.facts ?? assumedFacts(date, standing, patterns);
  const dayType = classifyDay(facts, standing);
  const rule = DAY_RULES[dayType];
  const bounds = dayBounds(facts, patterns.firstMealMinute != null ? { wakeMinute: Math.max(5 * 60, patterns.firstMealMinute - 60) } : undefined);
  const windows = freeWindows(facts, bounds.from, bounds.to);
  const why: PlanWhy[] = assumed ? ["assumed_day"] : [];

  const achievableG = achievableProteinG({ standing, facts, staples: input.staples, diet: input.diet });

  // This day's ledger row: its type, what it can absorb, whether there's time to train, its event allowance.
  const routine = input.routines[0] ?? null;
  const canTrain =
    LEDGER_RULES[dayType].canTrain &&
    rule.workout !== "none" &&
    !facts.flags.includes("no_gym_access") &&
    !!routine &&
    trainingWindow(windows, routine.minutes) != null;
  const isPattern = patterns.trainDays?.includes(weekdayOf(date));
  const ledger = input.ledger.map((d): DayLedgerInput => {
    if (d.date !== date) return d;
    const row: DayLedgerInput = {
      ...d,
      dayType,
      capacity: { ...defaultCapacity(dayType, d.baseProteinG), canTrain },
      achievableProteinG: achievableG,
    };
    if (dayType === "feast" || input.allowanceKcal != null) row.allowanceKcal = eventAllowance(d.baseKcal, input.allowanceKcal ?? d.allowanceKcal);
    if (base.maintenanceKcal != null) row.maintenanceKcal = base.maintenanceKcal;
    if (isPattern != null) row.patternDay = isPattern;
    // Numbers the user picked for this day (brief screen) stay put; the rest of the week moves around them.
    if (input.facts?.targets) row.chosen = input.facts.targets;
    else delete row.chosen;
    return row;
  });
  const weekOf = (rows: DayLedgerInput[]) => {
    const code = planWeek(rows, input.today, base.floorKcal, input.sessionsTarget, { goal: base.goal });
    // D85: the model decides the remaining days; the guard keeps every number inside the limits and the week adding up.
    const g = input.ai?.days?.length
      ? guardAiWeek(input.ai, { ledger: rows, today: input.today, floorKcal: base.floorKcal, goal: base.goal, sessionsTarget: input.sessionsTarget, code })
      : null;
    return { guarded: g, week: g ? applyGuarded(code, g) : code };
  };
  const { guarded, week } = weekOf(ledger);
  const row = ledger.find((d) => d.date === date);
  // The options are made as if nothing was picked for this day, so picking one doesn't move the others.
  const auto = row?.chosen ? weekOf(ledger.map((d) => (d.date === date ? { ...d, chosen: undefined } : d))).week : week;
  const options = row
    ? dayOptions(auto, row, base.floorKcal, base.goal)
    : { usual: { kcal: base.kcal, proteinG: base.proteinG, steps: base.steps }, even: { kcal: base.kcal, proteinG: base.proteinG, steps: base.steps }, faster: null };
  const wd = week.days.find((d) => d.date === date);
  for (const c of wd?.why ?? []) if (!why.includes(c)) why.push(c);

  const kcal = wd?.kcal ?? base.kcal;
  const proteinG = wd?.proteinG ?? Math.min(base.proteinG, achievableG);
  const steps = wd ? wd.steps : base.steps;
  const targets: DayPlan["targets"] = {
    kcal,
    proteinG,
    steps,
    waterGlasses: base.waterGlasses + (rule.water === "raised" ? SICK_EXTRA_GLASSES : 0),
  };
  // The target may be past what this day's meals give (a pick, or protein moved in): the step-up covers the gap.
  const stepUp = achievableG < proteinG ? proteinStepUp({ standing, facts, staples: input.staples, diet: input.diet, gapG: proteinG - achievableG }) : null;
  if (rule.maintenance && base.maintenanceKcal != null && base.maintenanceKcal !== kcal)
    targets.kcalRange = [Math.min(kcal, base.maintenanceKcal), Math.max(kcal, base.maintenanceKcal)];
  else if (rule.kcalRange) targets.kcalRange = [kcal - rule.kcalRange, kcal + rule.kcalRange];

  const cal = new Calendar(windows);
  const items: PlanItem[] = [];
  const latestMove = rule.latestWalkMinute ?? LATE_MOVE_MINUTE;

  // 1. Workout: the ledger chose today and there's a window that ends by 21:30.
  if (wd?.train && routine) {
    const want = patterns.trainMinute ?? (dayType === "late_work" ? bounds.from : 18 * 60);
    const at = cal.place(want, routine.minutes, LATE_MOVE_MINUTE);
    if (at != null) items.push({ kind: "workout", at, routineId: routine.id, name: routine.name, minutes: routine.minutes });
    else why.push("no_window_for_workout");
  }

  // 2. A walk: a late-work day walks at lunch; extra steps from the ledger become walk minutes.
  const extraSteps = steps != null ? steps - base.steps : 0;
  let walkMinutes = extraSteps > 0 ? Math.min(MAX_WALK_MINUTES, Math.max(MIN_WALK_MINUTES, roundTo5(extraSteps / STEPS_PER_WALK_MINUTE))) : 0;
  const lunchWalk = dayType === "late_work";
  if (lunchWalk) walkMinutes = Math.max(walkMinutes, LUNCH_WALK_MINUTES);
  if (walkMinutes && steps != null) {
    const at = cal.place(lunchWalk ? LUNCH_WALK_MINUTE : 18 * 60 + 30, walkMinutes, latestMove);
    if (at != null) {
      items.push({ kind: "walk", at, minutes: walkMinutes });
      if (lunchWalk) why.push("lunch_walk");
    }
  }

  // 3. Meals, at the usual time when it's learned. Eating inside a block is fine when the block has food.
  const usual = patterns.usualMeals[dayKindOf(date)];
  const ctxBase = { budgetKcal: kcal, focus: "protein" as const, diet: input.diet, cuisineShare: {}, hasKitchen: standing.hasKitchen, budget: standing.budget };
  for (const slot of SLOTS) {
    const learned = usual[slot];
    const want = learned?.at ?? SLOT_MINUTE[slot];
    const access = facts.mealAccess[slot] ?? accessForSource(standing.mealSource);
    const eatingBlock = facts.blocks.find((b) => want >= b.from && want < b.to && canEatIn(b));
    let at: number | null = eatingBlock ? want : cal.place(want, MEAL_MINUTES, LATE_MOVE_MINUTE);
    if (at == null) continue;
    if (eatingBlock && access === "event_food" && !why.includes("event_food")) why.push("event_food");
    at = Math.min(at, LATE_MOVE_MINUTE);
    const share = slot === "breakfast" && rule.protein === "front_load" ? FRONT_LOAD_BREAKFAST_SHARE : SLOT_SHARE[slot];
    const remaining = { kcal: kcal * SLOT_SHARE[slot], proteinG: proteinG * share, carbsG: 0, fatG: 0 };
    const options =
      access === "event_food"
        ? []
        : rankEatOptions(input.candidates, { ...ctxBase, remaining, mealType: slot, access }).slice(0, 3);
    items.push({ kind: "meal", slot, at, title: learned?.text ?? SLOT_LABEL[slot], access, options, usual: !!learned });
  }

  // 4. Prep for away and travel days. No timed water items: the water goal lives on the tracker.
  const out = facts.blocks.filter((b) => b.kind === "event" || b.kind === "travel");
  if (rule.water === "carry_bottle" && out.length) {
    const first = out[0]!;
    const leave = first.from - LEAVE_BEFORE_MINUTES;
    const label = first.label ? ` for ${first.label}` : "";
    const usable = usableStaples({ standing, facts: { ...facts, whereabouts: "travelling" }, staples: input.staples, diet: input.diet });
    const portable = PACK_ORDER.map((id) => usable.find((s) => s.id === id)).find((s) => !!s) ?? usable[0];
    const pack = portable ? `Pack ${portable.name} and a 1 L bottle${label}` : `Pack a snack and a 1 L bottle${label}`;
    items.push({ kind: "prep", at: PREP_EVENING_MINUTE, dayOffset: -1, text: pack });
    const before = cal.remind(leave - PREP_BEFORE_LEAVING);
    if (before != null && before >= bounds.from) items.push({ kind: "prep", at: before, dayOffset: 0, text: `Leaving soon: ${pack.charAt(0).toLowerCase()}${pack.slice(1)}` });
  }

  const sorted = items
    .filter((i) => (i.kind === "prep" && i.dayOffset === -1) || i.at >= input.now)
    .sort((a, b) => (a.kind === "prep" && a.dayOffset === -1 ? -1 : 0) - (b.kind === "prep" && b.dayOffset === -1 ? -1 : 0) || a.at - b.at);
  const plan: DayPlan = { date, dayType, assumed, targets, protein: { achievableG, stepUp }, options, items: sorted, why, week, source: guarded ? "ai" : "code" };
  if (guarded) plan.ai = { fellBack: guarded.fellBack, summary: guarded.summary };
  return plan;
}

/** FNV-1a over a stable JSON of the inputs: the plan is recomputed (and saved) only when this changes. */
export function planInputsHash(input: PlanDayInput): string {
  const stable = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .map((k) => [k, stable((v as Record<string, unknown>)[k])]),
      );
    return v;
  };
  const { now: _now, ...rest } = input;
  void _now;
  const text = JSON.stringify(stable(rest));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
