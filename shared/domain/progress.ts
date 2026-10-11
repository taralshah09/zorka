// Progress engine (P27–P29) — pure domain logic shared by mobile and backend (D24).
// No imports and no I/O: dates are local calendar days as YYYY-MM-DD strings, passed in by the caller.
//
// Constants are the ones accepted at the P27 gate (docs/DECISIONS.md D49). Changing any of them is a
// product decision: record it there first.

/** EMA smoothing per day (Hacker's Diet). Across a gap of n days the step is 1 − (1 − α)^n. */
export const TREND_ALPHA = 0.1;

export type WeighIn = { date: string; kg: number };
export type TrendPoint = { date: string; scaleKg: number; trendKg: number };

const DAY_MS = 86_400_000;

/** Whole days since 1970-01-01 for a YYYY-MM-DD date (calendar arithmetic, no time zones). */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / DAY_MS);
}

export function fromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export const addDays = (date: string, days: number) => fromDayNumber(dayNumber(date) + days);

/** 0 = Sunday … 6 = Saturday. */
export const weekday = (date: string) => new Date(dayNumber(date) * DAY_MS).getUTCDay();

/**
 * Trend weight: an exponential moving average of the scale. Several weigh-ins on one day are averaged first.
 * Gaps are not filled in: the next weigh-in moves the trend by 1 − (1 − α)^days, so the trend holds flat while
 * there's no data and catches up by the right amount afterwards.
 */
export function trendSeries(weighIns: readonly WeighIn[], alpha = TREND_ALPHA): TrendPoint[] {
  const byDay = new Map<string, { sum: number; n: number }>();
  for (const w of weighIns) {
    if (!Number.isFinite(w.kg) || w.kg <= 0) continue;
    const day = byDay.get(w.date) ?? { sum: 0, n: 0 };
    day.sum += w.kg;
    day.n += 1;
    byDay.set(w.date, day);
  }
  const days = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const out: TrendPoint[] = [];
  for (const [date, { sum, n }] of days) {
    const scaleKg = sum / n;
    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ date, scaleKg, trendKg: scaleKg });
      continue;
    }
    const step = 1 - (1 - alpha) ** (dayNumber(date) - dayNumber(prev.date));
    out.push({
      date,
      scaleKg,
      trendKg: prev.trendKg + step * (scaleKg - prev.trendKg),
    });
  }
  return out;
}

/** The last point on or before `date`, or null when the series starts later. */
export function pointOn(series: readonly TrendPoint[], date: string): TrendPoint | null {
  let found: TrendPoint | null = null;
  for (const p of series) {
    if (p.date > date) break;
    found = p;
  }
  return found;
}

/** Trend weight as of the end of `date` (held flat since the last weigh-in). */
export const trendOn = (series: readonly TrendPoint[], date: string) => pointOn(series, date)?.trendKg ?? null;

/** Change in trend weight over the 7 days ending `date`. */
export function weeklyTrendChange(series: readonly TrendPoint[], date: string): number | null {
  const end = trendOn(series, date);
  const start = trendOn(series, addDays(date, -7));
  return end == null || start == null ? null : end - start;
}

// ── Weekly check-in window (P28) ─────────────────────────────────────────────────────────────────

export type CheckinWindow = {
  /** The Sunday the check-in belongs to (one per week, the key for the stored result). */
  checkinDate: string;
  /** The 7 completed days before it: Sunday … Saturday. */
  start: string;
  end: string;
};

/** The most recent check-in on or before `today`. It covers the 7 full days before that Sunday. */
export function checkinWindow(today: string): CheckinWindow {
  const checkinDate = addDays(today, -weekday(today));
  return {
    checkinDate,
    start: addDays(checkinDate, -7),
    end: addDays(checkinDate, -1),
  };
}

export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let n = dayNumber(start); n <= dayNumber(end); n++) out.push(fromDayNumber(n));
  return out;
}

// ── Phases (P29) ─────────────────────────────────────────────────────────────────────────────────

export type PhaseGoal = "lose_fat" | "build_muscle" | "maintain" | "get_fitter";

/** The goal is reached when the trend (not the scale) crosses the target weight. */
export function goalReached(goal: PhaseGoal, targetWeightKg: number | null, trendKg: number | null): boolean {
  if (targetWeightKg == null || trendKg == null) return false;
  if (goal === "lose_fat") return trendKg <= targetWeightKg;
  if (goal === "build_muscle") return trendKg >= targetWeightKg;
  return false;
}

/** Share of the way from the starting trend to the target, 0–1. null without a target. */
export function goalProgress(startKg: number | null, targetKg: number | null, nowKg: number | null): number | null {
  if (startKg == null || targetKg == null || nowKg == null || startKg === targetKg) return null;
  return Math.min(1, Math.max(0, (nowKg - startKg) / (targetKg - startKg)));
}

export type DayIntake = { date: string; kcal: number; proteinG: number };

export type PhaseSummary = {
  days: number;
  weeks: number;
  startTrendKg: number | null;
  endTrendKg: number | null;
  /** End minus start, signed. null without weigh-ins on both sides. */
  changeKg: number | null;
  loggedDays: number;
  /** Averages over the days with food logged. null when none were. */
  avgKcal: number | null;
  avgProteinG: number | null;
  workouts: number;
  prs: number;
  distanceKm: number;
};

/**
 * Closing summary for a phase ("Summer Cut · 9 weeks · −4.2 kg · avg 138 g protein · 31 workouts · 4 PRs").
 * The starting trend is the trend on the start date, or the first weigh-in inside the phase.
 */
export function phaseSummary(input: {
  start: string;
  end: string;
  series: readonly TrendPoint[];
  intake: readonly DayIntake[];
  workouts: number;
  prs: number;
  distanceM: number;
}): PhaseSummary {
  const { start, end, series } = input;
  const days = Math.max(1, dayNumber(end) - dayNumber(start) + 1);
  const firstInside = series.find((p) => p.date >= start && p.date <= end);
  const startTrendKg = trendOn(series, start) ?? firstInside?.trendKg ?? null;
  const endTrendKg = firstInside || trendOn(series, start) != null ? trendOn(series, end) : null;
  const logged = input.intake.filter((d) => d.date >= start && d.date <= end);
  const avg = (f: (d: DayIntake) => number) =>
    logged.length ? logged.reduce((s, d) => s + f(d), 0) / logged.length : null;
  return {
    days,
    weeks: Math.max(1, Math.round(days / 7)),
    startTrendKg,
    endTrendKg,
    changeKg: startTrendKg != null && endTrendKg != null ? endTrendKg - startTrendKg : null,
    loggedDays: logged.length,
    avgKcal: avg((d) => d.kcal),
    avgProteinG: avg((d) => d.proteinG),
    workouts: input.workouts,
    prs: input.prs,
    distanceKm: input.distanceM / 1000,
  };
}
