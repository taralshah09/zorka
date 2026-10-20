// D87 · The weekly report card on the phone: each day of the check-in week from the local stores (meals and their
// coverage, the Health Connect step cache, finished workouts, the day's saved plan), scored the way the Today calendar
// scores goal days, then shared/domain/report.ts turns it into the card. It's stored with the check-in when answered.
import { useMemo } from "react";

import { useSyncStatus } from "@/core/sync/engine";
import { dayCredit, useActivityVersion } from "@/features/activity/store";
import { workoutsBetween, useWorkoutsStamp } from "@/features/gym/store";
import { targetsOn } from "@/features/life/dayTargets";
import { planFor, usePlansVersion } from "@/features/life/plans";
import { coverageFor, useCoverageVersion } from "@/features/meals/coverage";
import { useMealsVersion } from "@/features/meals/store";
import { stepsBetween } from "@/features/today/goalDays";
import { scoreGoalDay } from "@shared/domain/gap";
import { datesBetween } from "@shared/domain/progress";
import { weekReport, type ReportDay, type WeekReport } from "@shared/domain/report";
import type { Targets } from "@shared/domain/targets";
import { dayIntake } from "./queries";
import { useCheckins } from "./checkins";

export function buildWeekReport(userId: string, start: string, end: string, base: Targets, sessionsTarget: number): WeekReport {
  const intake = new Map(dayIntake(userId, start, end).map((d) => [d.date, d]));
  const steps = stepsBetween(userId, start, end);
  const trained = new Set(workoutsBetween(userId, start, end).map((w) => w.localDate));
  const days: ReportDay[] = datesBetween(start, end).map((date) => {
    const stored = planFor(userId, date);
    const plan = stored?.plan ?? null;
    const t = targetsOn(userId, date, base);
    const eaten = intake.get(date);
    const logged = !!eaten && coverageFor(userId, date) === "complete";
    const stepGoal = plan ? plan.targets.steps : t.steps;
    const hit = scoreGoalDay(
      { eaten: { kcal: eaten?.kcal ?? 0, proteinG: eaten?.proteinG ?? 0, logged }, steps: steps.get(date) ?? null, glasses: 0 },
      { kcal: t.kcal + dayCredit(userId, date).kcal, proteinG: t.proteinG, steps: t.steps, waterGlasses: 0 },
    );
    return {
      date,
      dayType: plan?.dayType ?? null,
      logged,
      kcal: Math.round(eaten?.kcal ?? 0),
      proteinG: Math.round(eaten?.proteinG ?? 0),
      steps: steps.get(date) ?? null,
      trained: trained.has(date),
      target: {
        kcal: t.kcal + dayCredit(userId, date).kcal,
        proteinG: t.proteinG,
        steps: stepGoal,
        train: !!plan?.week.days.find((d) => d.date === date)?.train,
      },
      hit: { calories: hit.calories, protein: hit.protein, steps: stepGoal != null && hit.steps },
    };
  });
  return weekReport(days, start, end, sessionsTarget);
}

/** The live card for a week (the check-in screen), re-read when any of its stores change. */
export function useWeekReport(
  userId: string | null,
  start: string,
  end: string,
  base: Targets | null,
  sessionsTarget: number,
): WeekReport | null {
  const meals = useMealsVersion((s) => s.v);
  const coverage = useCoverageVersion((s) => s.v);
  const plans = usePlansVersion((s) => s.v);
  const workouts = useWorkoutsStamp();
  const activity = useActivityVersion();
  const sync = useSyncStatus((s) => s.lastSyncedAt);
  return useMemo(() => {
    void meals;
    void coverage;
    void plans;
    void workouts;
    void activity;
    void sync;
    return userId && base ? buildWeekReport(userId, start, end, base, sessionsTarget) : null;
  }, [userId, start, end, base, sessionsTarget, meals, coverage, plans, workouts, activity, sync]);
}

/** Stored report cards, newest first (one per answered check-in that has one). */
export function useStoredReports(userId: string | null): { checkinDate: string; report: WeekReport }[] {
  const checkins = useCheckins(userId);
  return useMemo(
    () =>
      checkins
        .filter((c) => c.report)
        .map((c) => ({ checkinDate: c.checkinDate, report: c.report! }))
        .reverse(),
    [checkins],
  );
}
