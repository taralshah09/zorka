// D85 · AI-planned weeks, code-guarded. The model proposes each remaining day's kcal, protein, steps and workout (with a
// reason); this file is the guard: every number is clamped to hard safety limits, workouts only go where the day can
// hold one, and a metric whose week no longer adds up falls back to the code plan (week.ts). Pure and deterministic,
// so whatever the model says, the result is always inside the limits. Runs every time the plan is computed.
//
// Constants are proposals at the D85 gate. Changing any of them is a product decision.
import type { Goal } from "./targets.js";
import {
  clampChosen,
  eventAllowance,
  LEDGER_RULES,
  MAX_TRAINING_STREAK,
  sickMinProtein,
  WEEK_KCAL_MAX_SHIFT,
  WEEK_KCAL_MAX_SHIFT_UP_LOSE_FAT,
  WEEK_PROTEIN_MAX_ADD_SHARE,
  WEEK_STEPS_MAX_ADD,
  type DayLedgerInput,
  type WeekPlan,
} from "./week.js";

/** One day as the model proposes it. */
export type AiDay = { date: string; kcal: number; proteinG: number; steps: number | null; train: boolean; reason?: string | null };
export type AiWeek = { days: AiDay[]; summary?: string | null };

export type Metric = "kcal" | "proteinG" | "steps" | "train";
export type GuardedDay = {
  date: string;
  kcal: number;
  proteinG: number;
  steps: number | null;
  train: boolean;
  /** The model's reason, trimmed; null when there was none or the day fell back. */
  reason: string | null;
  /** Metrics the guard had to change. */
  clamped: Metric[];
};
export type GuardedWeek = {
  days: GuardedDay[];
  /** Metrics where the model's week didn't add up, so the code plan's numbers were used. */
  fellBack: Array<"kcal" | "proteinG" | "steps">;
  summary: string | null;
};

/** The model's week may drift this share of the week's budget from it before a metric falls back. */
export const AI_WEEK_TOLERANCE = 0.05;
/** A step goal never drops below this share of base. */
export const AI_STEPS_MIN_SHARE = 0.5;
export const AI_REASON_MAX = 160;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const whole = (n: unknown, fallback: number) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback);
const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
const text = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim().replace(/\s+/g, " ").slice(0, AI_REASON_MAX) : null);

export type GuardInput = {
  ledger: readonly DayLedgerInput[];
  today: string;
  floorKcal: number;
  goal: Goal | null;
  sessionsTarget: number;
  /** The code plan for the same week (the fallback and the yardstick). */
  code: WeekPlan;
};

/** The hard limits for one future day. */
export function dayLimits(d: DayLedgerInput, floorKcal: number, goal: Goal | null) {
  const base = Math.round(d.baseKcal);
  const event = d.allowanceKcal != null || d.dayType === "feast";
  const up = goal === "lose_fat" ? WEEK_KCAL_MAX_SHIFT_UP_LOSE_FAT : WEEK_KCAL_MAX_SHIFT;
  let kcal: [number, number];
  if (event) kcal = [base, eventAllowance(base, base + 800)];
  else if (d.dayType === "sick") {
    const m = Math.max(base, Math.round(d.maintenanceKcal ?? base));
    kcal = [m, m + WEEK_KCAL_MAX_SHIFT];
  } else kcal = [Math.max(floorKcal, base - WEEK_KCAL_MAX_SHIFT), base + up];
  if (kcal[0] > kcal[1]) kcal = [kcal[1], kcal[1]];
  const reach = Math.round(Math.min(d.baseProteinG, d.achievableProteinG ?? Infinity));
  const sick = d.dayType === "sick";
  // D86: a sick day's protein is its gentle minimum, so the "aim for at least…" line and the tracker agree.
  const pBase = sick ? Math.min(reach, sickMinProtein(Math.round(d.baseProteinG))) : reach;
  // Like the code plan, protein may go past what the meals give (the step-up covers it), by ≤ 20%.
  const pHi = sick ? pBase : Math.max(pBase, Math.round(pBase * (1 + WEEK_PROTEIN_MAX_ADD_SHARE)));
  const stepsFactor = LEDGER_RULES[d.dayType].stepsFactor;
  const steps: [number, number] | null =
    stepsFactor == null ? null : [Math.round(d.baseSteps * AI_STEPS_MIN_SHARE), Math.round(d.baseSteps) + WEEK_STEPS_MAX_ADD];
  const canTrain = LEDGER_RULES[d.dayType].canTrain && d.capacity.canTrain && !d.actual?.trained;
  return { kcal, protein: [pBase, pHi] as [number, number], steps, canTrain };
}

/**
 * The model's week, made safe. Past days and today's already-trained session keep the code plan. Missing or broken
 * days use the code plan's numbers. Workouts: only trainable days, at most the sessions left, never more than
 * MAX_TRAINING_STREAK in a row (counting days already trained), earliest first.
 */
export function guardAiWeek(ai: AiWeek | null | undefined, input: GuardInput): GuardedWeek {
  const t = dayNumber(input.today);
  const byDate = new Map((ai?.days ?? []).filter((d) => d && typeof d.date === "string").map((d) => [d.date, d]));
  const codeByDate = new Map(input.code.days.map((d) => [d.date, d]));
  const rows = [...input.ledger].sort((a, b) => dayNumber(a.date) - dayNumber(b.date));
  const future = rows.filter((d) => dayNumber(d.date) >= t);

  let days: GuardedDay[] = future.map((d) => {
    const code = codeByDate.get(d.date)!;
    const lim = dayLimits(d, input.floorKcal, input.goal);
    const a = byDate.get(d.date);
    const clamped: Metric[] = [];
    const pick = (m: Metric, want: number, lo: number, hi: number) => {
      const v = clamp(want, lo, hi);
      if (v !== want) clamped.push(m);
      return v;
    };
    // A number the user picked for the day is theirs: the model can't change it (the code plan already holds it).
    const mine = clampChosen(d, input.floorKcal, input.goal);
    const kcal = mine.kcal != null ? code.kcal : pick("kcal", whole(a?.kcal, code.kcal), lim.kcal[0], lim.kcal[1]);
    const proteinG = mine.proteinG != null ? code.proteinG : pick("proteinG", whole(a?.proteinG, code.proteinG), lim.protein[0], lim.protein[1]);
    const steps =
      mine.steps != null
        ? code.steps
        : lim.steps
          ? pick("steps", whole(a?.steps, code.steps ?? Math.round(d.baseSteps)), lim.steps[0], lim.steps[1])
          : null;
    if (!lim.steps && a?.steps != null) clamped.push("steps");
    const wantTrain = a ? a.train === true : code.train;
    const train = wantTrain && lim.canTrain;
    if (wantTrain && !train) clamped.push("train");
    return { date: d.date, kcal, proteinG, steps, train, reason: a ? text(a.reason) : null, clamped };
  });

  // Workouts: no more than are left this week, never a run longer than MAX_TRAINING_STREAK.
  const trained = new Set(rows.filter((d) => d.actual?.trained && dayNumber(d.date) <= t).map((d) => dayNumber(d.date)));
  const left = Math.max(0, input.sessionsTarget - trained.size);
  let planned = 0;
  days = days.map((d) => {
    if (!d.train) return d;
    const n = dayNumber(d.date);
    const run = (k: number) => trained.has(k);
    const streak = (run(n - 1) ? 1 + (run(n - 2) ? 1 : 0) : 0) + (run(n + 1) ? 1 + (run(n + 2) ? 1 : 0) : 0);
    if (planned >= left || streak >= MAX_TRAINING_STREAK) return { ...d, train: false, clamped: [...d.clamped, "train"] };
    planned++;
    trained.add(n);
    return d;
  });

  // The week must still add up: if a metric drifts too far from the code plan's week, use the code plan for it.
  const budget = (k: "kcal" | "proteinG" | "steps") =>
    rows.reduce((s, d) => s + (k === "kcal" ? d.baseKcal : k === "proteinG" ? d.baseProteinG : d.baseSteps), 0);
  const total = (k: "kcal" | "proteinG" | "steps", list: { date: string; kcal: number; proteinG: number; steps: number | null }[]) =>
    list.filter((d) => dayNumber(d.date) >= t).reduce((s, d) => s + (d[k] ?? 0), 0);
  const fellBack: GuardedWeek["fellBack"] = [];
  for (const k of ["kcal", "proteinG", "steps"] as const) {
    const drift = total(k, days) - total(k, input.code.days);
    // Under on kcal or over on protein/steps is "too far" either way; protein and steps only fall back when short.
    const tooFar = k === "kcal" ? Math.abs(drift) > AI_WEEK_TOLERANCE * budget(k) : drift < -AI_WEEK_TOLERANCE * budget(k);
    if (!tooFar) continue;
    fellBack.push(k);
    days = days.map((d) => ({ ...d, [k]: codeByDate.get(d.date)![k] }) as GuardedDay);
  }
  return { days, fellBack, summary: text(ai?.summary) };
}

/** The code week with the guarded AI days in place of its future days (past days stay as counted). */
export function applyGuarded(code: WeekPlan, g: GuardedWeek): WeekPlan {
  const byDate = new Map(g.days.map((d) => [d.date, d]));
  return {
    ...code,
    days: code.days.map((d) => {
      const a = byDate.get(d.date);
      if (!a || d.past) return d;
      // The code's "since Tuesday" record explains the code's numbers, not these, so the AI's reason replaces it.
      const { adjust: _code, ...rest } = d;
      void _code;
      return { ...rest, kcal: a.kcal, proteinG: a.proteinG, steps: a.steps, train: a.train, ai: { reason: a.reason, guarded: a.clamped } };
    }),
  };
}
