// D87 · The weekly report card, shown at the check-in and stored with it (one per week, the history). Pure: the phone
// gathers each day of the check-in week (what was eaten and walked, workouts, the day's planned targets and the goal-day
// hits) and this turns it into averages, a grade per area, and a few plain lines on what went well and what to work on.
// The words are made here, once, so a stored card reads the same forever.
import type { DayType } from "./dayType.js";

export type ReportDay = {
  date: string;
  /** The day's type from its plan; null when there was no plan. */
  dayType: DayType | null;
  /** Food was logged and the day marked complete. kcal/protein count only on these days. */
  logged: boolean;
  kcal: number;
  proteinG: number;
  /** null = no step data for the day. */
  steps: number | null;
  trained: boolean;
  /** The day's targets (its plan's when it had one). steps null = no step goal (travel, sick). */
  target: { kcal: number; proteinG: number; steps: number | null; train: boolean };
  /** Goal-day hits, as the Today calendar scores them (shared/domain/gap.ts scoreGoalDay). */
  hit: { calories: boolean; protein: boolean; steps: boolean };
};

export type Grade = "A" | "B" | "C" | "D";
export type ReportArea = "calories" | "protein" | "steps" | "workouts" | "logging";

export type WeekReport = {
  start: string;
  end: string;
  grade: Grade;
  /** 0–100, the mean of the areas that had data. */
  score: number;
  daysLogged: number;
  kcal: { avg: number | null; target: number; onTargetDays: number; grade: Grade | null };
  protein: { avg: number | null; target: number; hitDays: number; grade: Grade | null };
  steps: { avg: number | null; target: number | null; hitDays: number; days: number; grade: Grade | null };
  workouts: { done: number; planned: number; missed: string[]; grade: Grade | null };
  sickDays: number;
  wentWell: string[];
  toWorkOn: string[];
  /** One thing to try next week, from the weakest area. */
  focus: string | null;
};

export const REPORT_MAX_LINES = 4;
/** Fewer fully logged days than this and the food averages are called rough. */
export const REPORT_MIN_LOGGED = 5;

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const wd = (date: string) => WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export function gradeFor(score: number): Grade {
  return score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D";
}

const FOCUS: Record<ReportArea, string> = {
  protein: "Next week: get protein in at breakfast. It makes the rest of the day much easier to hit.",
  calories: "Next week: tell me about treat days ahead with a brief, so the rest of the week makes room for them.",
  steps: "Next week: a 15-minute walk after lunch adds about 2,000 steps.",
  workouts: "Next week: choose your workout days on Monday and keep them in the plan.",
  logging: "Next week: log every meal, even roughly. The plan gets sharper with every day you log.",
};

/** The report card for the week `start`–`end`. `sessionsTarget` is the week's workout goal. */
export function weekReport(days: readonly ReportDay[], start: string, end: string, sessionsTarget: number): WeekReport {
  const inWeek = [...days].filter((d) => d.date >= start && d.date <= end).sort((a, b) => (a.date < b.date ? -1 : 1));
  const logged = inWeek.filter((d) => d.logged);
  const sick = inWeek.filter((d) => d.dayType === "sick");
  const withSteps = inWeek.filter((d) => d.steps != null && d.target.steps != null);
  const plannedDays = inWeek.filter((d) => d.target.train);
  const done = inWeek.filter((d) => d.trained).length;
  const planned = Math.max(sessionsTarget, plannedDays.length, 0);
  const missed = plannedDays.filter((d) => !d.trained).map((d) => d.date);

  const avgTarget = (xs: ReportDay[], f: (d: ReportDay) => number) => Math.round(mean(xs.map(f)) ?? 0);
  const ref = logged.length ? logged : inWeek;
  const kcal = {
    avg: logged.length ? Math.round(mean(logged.map((d) => d.kcal))!) : null,
    target: avgTarget(ref, (d) => d.target.kcal),
    onTargetDays: logged.filter((d) => d.hit.calories).length,
  };
  const protein = {
    avg: logged.length ? Math.round(mean(logged.map((d) => d.proteinG))!) : null,
    target: avgTarget(ref, (d) => d.target.proteinG),
    hitDays: logged.filter((d) => d.hit.protein).length,
  };
  const steps = {
    avg: withSteps.length ? Math.round(mean(withSteps.map((d) => d.steps!))!) : null,
    target: withSteps.length ? avgTarget(withSteps, (d) => d.target.steps!) : null,
    hitDays: withSteps.filter((d) => d.hit.steps).length,
    days: withSteps.length,
  };

  // Each area scores 0–100; an area with no data has no grade and doesn't count.
  const scores: Partial<Record<ReportArea, number>> = {};
  if (logged.length) {
    scores.calories = (100 * kcal.onTargetDays) / logged.length;
    // Average protein against target counts as much as the days hit: one big day can't hide five short ones.
    scores.protein = 50 * (protein.hitDays / logged.length) + 50 * Math.min(1, protein.avg! / Math.max(1, protein.target));
  }
  if (withSteps.length) scores.steps = 50 * (steps.hitDays / withSteps.length) + 50 * Math.min(1, steps.avg! / Math.max(1, steps.target!));
  if (planned > 0) scores.workouts = 100 * Math.min(1, done / planned);
  scores.logging = (100 * logged.length) / Math.max(1, inWeek.length);
  const got = Object.values(scores);
  const score = Math.round(mean(got) ?? 0);
  const g = (a: ReportArea) => (scores[a] != null ? gradeFor(scores[a]!) : null);

  // ── The words ──
  const well: Array<{ s: number; text: string }> = [];
  const work: Array<{ s: number; area: ReportArea; text: string }> = [];
  const short = (f: (d: ReportDay) => boolean) => list(logged.filter((d) => !f(d)).map((d) => wd(d.date)));

  if (logged.length === inWeek.length && inWeek.length >= 7) well.push({ s: 90, text: "You logged every day this week." });
  else if (logged.length < REPORT_MIN_LOGGED)
    work.push({
      s: scores.logging!,
      area: "logging",
      text: `${logged.length} of ${inWeek.length} days fully logged, so the food numbers are rough.`,
    });

  if (scores.protein != null) {
    if (scores.protein >= 80) well.push({ s: scores.protein, text: `Protein averaged ${protein.avg} g against ${protein.target} g, on target ${protein.hitDays} of ${logged.length} logged days.` });
    else work.push({ s: scores.protein, area: "protein", text: `Protein averaged ${protein.avg} g of ${protein.target} g. Short on ${short((d) => d.hit.protein)}.` });
  }
  if (scores.calories != null) {
    const over = logged.filter((d) => !d.hit.calories);
    if (scores.calories >= 80) well.push({ s: scores.calories, text: `Calories on target ${kcal.onTargetDays} of ${logged.length} logged days.` });
    else {
      const by = Math.round(mean(over.map((d) => d.kcal - d.target.kcal)) ?? 0);
      work.push({ s: scores.calories, area: "calories", text: `Calories went over on ${list(over.map((d) => wd(d.date)))}${by > 0 ? `, by about ${fmt(by)} kcal on those days` : ""}.` });
    }
  }
  if (scores.steps != null) {
    if (steps.avg! >= steps.target!) well.push({ s: scores.steps, text: `Steps averaged ${fmt(steps.avg!)} a day, above your ${fmt(steps.target!)} goal.` });
    else if (scores.steps < 75) work.push({ s: scores.steps, area: "steps", text: `Steps averaged ${fmt(steps.avg!)} of ${fmt(steps.target!)} a day.` });
  }
  if (scores.workouts != null) {
    if (done >= planned) well.push({ s: 95, text: `All ${done} workout${done === 1 ? "" : "s"} done.` });
    else
      work.push({
        s: scores.workouts,
        area: "workouts",
        text: `${done} of ${planned} workouts done${missed.length ? `; missed ${list(missed.map(wd))}` : ""}.`,
      });
  }
  // The best day: the most goals hit (ties go to the latest).
  const best = [...logged].sort((a, b) => hits(b) - hits(a) || (a.date < b.date ? 1 : -1))[0];
  if (best && hits(best) === 3) well.push({ s: 70, text: `Best day: ${wd(best.date)}, every goal hit.` });
  // Always said: being unwell is context for every other line.
  if (sick.length) well.push({ s: 1000, text: `You were unwell on ${list(sick.map((d) => wd(d.date)))}. Those days asked for less, and that's fine.` });

  well.sort((a, b) => b.s - a.s);
  work.sort((a, b) => a.s - b.s);
  return {
    start,
    end,
    grade: gradeFor(score),
    score,
    daysLogged: logged.length,
    kcal: { ...kcal, grade: g("calories") },
    protein: { ...protein, grade: g("protein") },
    steps: { ...steps, grade: g("steps") },
    workouts: { done, planned, missed, grade: g("workouts") },
    sickDays: sick.length,
    wentWell: well.slice(0, REPORT_MAX_LINES).map((w) => w.text),
    toWorkOn: work.slice(0, REPORT_MAX_LINES).map((w) => w.text),
    focus: work[0] ? FOCUS[work[0].area] : null,
  };
}

const hits = (d: ReportDay) => [d.hit.calories, d.hit.protein, d.hit.steps].filter(Boolean).length;
