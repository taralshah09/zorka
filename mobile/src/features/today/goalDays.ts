// Goal days for a month on the Today calendar: each past day scored against the current targets
// (shared/domain/goalDays.ts). Read from the local stores (meals, Health Connect step cache, activities, water), so it
// works offline and re-reads when any of them change.
import { useMemo } from "react";

import { getDb } from "@/core/storage/db";
import { useSyncStatus } from "@/core/sync/engine";
import { dayCredit, useActivityVersion } from "@/features/activity/store";
import { useMealsVersion } from "@/features/meals/store";
import { coverageFor, useCoverageVersion } from "@/features/meals/coverage";
import { dayIntake } from "@/features/progress/queries";
import { glassesBetween, useWaterVersion } from "@/features/water/store";
import { scoreGoalDay, type GoalDay } from "@shared/domain/gap";
import { datesBetween } from "@shared/domain/progress";
import type { Targets } from "@shared/domain/targets";
import { targetsOn, waterFor } from "@/features/life/dayTargets";
import { planFor, usePlansVersion } from "@/features/life/plans";

/** First and last local date of the month `month` (YYYY-MM) is in. */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const days = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(days).padStart(2, "0")}` };
}

export function stepsBetween(userId: string, start: string, end: string): Map<string, number> {
  const rows = getDb().getAllSync<{ date: string; steps: number }>(
    `SELECT local_date AS date, steps FROM health_steps WHERE user_id = ? AND local_date BETWEEN ? AND ?`,
    userId,
    start,
    end,
  );
  return new Map(rows.map((r) => [r.date, r.steps]));
}

/** Scores for every day of `month` (YYYY-MM) up to `today`. Later days are left out. */
export function goalMonth(
  userId: string,
  month: string,
  today: string,
  targets: Targets,
  waterGoal: number,
): Map<string, GoalDay> {
  const { start, end: monthEnd } = monthRange(month);
  const end = monthEnd < today ? monthEnd : today;
  const out = new Map<string, GoalDay>();
  if (start > end) return out;
  const intake = new Map(dayIntake(userId, start, end).map((d) => [d.date, d]));
  const steps = stepsBetween(userId, start, end);
  const water = glassesBetween(userId, start, end);
  for (const date of datesBetween(start, end)) {
    const eaten = intake.get(date);
    // A planned day is scored against its plan (LA3); other days against the base.
    const t = targetsOn(userId, date, targets);
    out.set(
      date,
      scoreGoalDay(
        {
          eaten: { kcal: eaten?.kcal ?? 0, proteinG: eaten?.proteinG ?? 0, logged: !!eaten && coverageFor(userId, date) === "complete" },
          steps: steps.get(date) ?? null,
          glasses: water.get(date) ?? 0,
        },
        {
          kcal: t.kcal + dayCredit(userId, date).kcal,
          proteinG: t.proteinG,
          steps: t.steps,
          waterGlasses: waterFor(planFor(userId, date), waterGoal),
        },
      ),
    );
  }
  return out;
}

export function useGoalMonth(
  userId: string | null,
  month: string,
  today: string,
  targets: Targets | null,
  waterGoal: number,
): Map<string, GoalDay> {
  const meals = useMealsVersion((s) => s.v);
  const coverageVersion = useCoverageVersion((s) => s.v);
  const water = useWaterVersion((s) => s.v);
  const activity = useActivityVersion();
  const sync = useSyncStatus((s) => s.lastSyncedAt);
  const plans = usePlansVersion((s) => s.v);
  return useMemo(() => {
    void plans;
    void coverageVersion;
    void meals;
    void water;
    void activity;
    void sync;
    return userId && targets ? goalMonth(userId, month, today, targets, waterGoal) : new Map();
  }, [userId, month, today, targets, waterGoal, meals, water, activity, sync, coverageVersion, plans]);
}
