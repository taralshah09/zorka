// Streak service (P30) — pure domain logic shared by mobile and backend (D24).
// No imports and no I/O: the caller passes the local days that have a log, plus "today" and the local hour.
//
// Rules accepted at the P30 gate (docs/DECISIONS.md D52). Changing any of them is a product decision: record
// it there first. The whole streak is derived from the logs, so nothing is stored or synced, and a log added
// later for an earlier day counts for that day.

export const STREAK_MILESTONES = [7, 30, 100] as const;
export const STARTING_FREEZES = 1;
export const MAX_FREEZES = 2;
/** One freeze is earned for every this many logged days in a row. */
export const FREEZE_EARN_DAYS = 7;
/** From this local hour, a streak with nothing logged today is "at risk". */
export const AT_RISK_HOUR = 20;

export type StreakDayState = "logged" | "frozen" | "missed";
export type StreakDay = { date: string; state: StreakDayState };

export type Streak = {
  /** Days in the current streak (frozen days keep it alive but don't add to it). */
  current: number;
  best: number;
  freezes: number;
  todayLogged: boolean;
  /** Streak > 0, nothing logged today, and it's past AT_RISK_HOUR. */
  atRisk: boolean;
  /** From the first logged day to today. Today appears only once it's logged. */
  days: StreakDay[];
  nextMilestone: number | null;
  /** The milestone reached today, if any (P39 celebrates it). */
  milestoneToday: number | null;
};

const DAY_MS = 86_400_000;
const toDay = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / DAY_MS);
};
const fromDay = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/**
 * Walks every day from the first log to today. A logged day adds 1 and counts toward the next freeze. A missed
 * day uses a freeze if one is held (the day shows a snowflake); with none left the streak resets to 0.
 * Today is never "missed": until midnight it can still be logged.
 */
export function computeStreak(loggedDates: Iterable<string>, today: string, hour: number): Streak {
  const todayN = toDay(today);
  const logged = new Set<number>();
  for (const d of loggedDates) {
    const n = toDay(d);
    if (Number.isFinite(n) && n <= todayN) logged.add(n);
  }

  const days: StreakDay[] = [];
  let current = 0;
  let best = 0;
  let freezes = STARTING_FREEZES;
  let towardFreeze = 0;
  let milestoneToday: number | null = null;
  const first = logged.size ? Math.min(...logged) : todayN + 1;

  for (let n = first; n <= todayN; n++) {
    if (logged.has(n)) {
      current += 1;
      towardFreeze += 1;
      if (towardFreeze === FREEZE_EARN_DAYS) {
        freezes = Math.min(MAX_FREEZES, freezes + 1);
        towardFreeze = 0;
      }
      best = Math.max(best, current);
      if (n === todayN && (STREAK_MILESTONES as readonly number[]).includes(current)) milestoneToday = current;
      days.push({ date: fromDay(n), state: "logged" });
    } else if (n === todayN) {
      break;
    } else if (current > 0 && freezes > 0) {
      freezes -= 1;
      days.push({ date: fromDay(n), state: "frozen" });
    } else {
      current = 0;
      towardFreeze = 0;
      days.push({ date: fromDay(n), state: "missed" });
    }
  }

  const todayLogged = logged.has(todayN);
  return {
    current,
    best,
    freezes,
    todayLogged,
    atRisk: current > 0 && !todayLogged && hour >= AT_RISK_HOUR,
    days,
    nextMilestone: STREAK_MILESTONES.find((m) => m > current) ?? null,
    milestoneToday,
  };
}
