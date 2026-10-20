// Screen-level hooks for Flow C: everything S10 and S33–S40 read, memoised on the local day and the store versions so
// a ticking clock doesn't re-run SQLite queries every second.
import { useMemo } from "react";

import { useActivityVersion } from "@/features/activity/store";
import { useWorkoutsVersion } from "@/features/gym/store";
import { useMealsVersion } from "@/features/meals/store";
import { useCoverageVersion } from "@/features/meals/coverage";
import { useTargets } from "@/features/targets/targets";
import { useActiveUser } from "@/features/users/activeUser";
import { localDate } from "@shared/domain/food";
import { addDays, weeklyTrendChange } from "@shared/domain/progress";
import { pendingCheckin, useCheckins } from "./checkins";
import { activePhase, useEnsureFirstPhase, usePhases } from "./phases";
import { activityDistanceM, dayIntake, completeIntake, workoutCounts } from "./queries";
import { useStreak } from "./streak";
import { useTrend } from "./weights";

/** Weigh-ins, trend, phases, check-ins, this week's pending check-in and the streak for the active user. */
export function useProgress(now: number) {
  const userId = useActiveUser((s) => s.userId);
  const { profile, targets, plan, source } = useTargets();
  const { weights, series, latest } = useTrend(userId, profile.data);
  const phases = usePhases(userId);
  const checkins = useCheckins(userId);
  const streak = useStreak(userId, now);
  const meals = useMealsVersion((s) => s.v);
  const coverageVersion = useCoverageVersion((s) => s.v);
  const today = localDate(new Date(now));
  useEnsureFirstPhase(userId, profile.data, plan);

  const pending = useMemo(() => {
    void coverageVersion;
    void meals;
    return userId && profile.data && plan
      ? pendingCheckin({ userId, profile: profile.data, base: plan, phases, checkins, series, today })
      : null;
  }, [userId, profile.data, plan, phases, checkins, series, today, meals, coverageVersion]);

  return {
    userId,
    profile,
    targets,
    plan,
    source,
    weights,
    series,
    latest,
    weekChange: weeklyTrendChange(series, today),
    phases,
    active: activePhase(phases),
    checkins,
    pending,
    streak,
    today,
  };
}

export type WeekStats = { avgKcal: number | null; avgProteinG: number | null; workouts: number; km: number; loggedDays: number; completeDays: number; lifetimeWorkouts: number };

/** S33 "This week": the last 7 days including today. */
export function useWeekStats(userId: string | null, today: string): WeekStats {
  const coverageVersion = useCoverageVersion((s) => s.v);
  const meals = useMealsVersion((s) => s.v);
  const workoutsV = useWorkoutsVersion((s) => s.v);
  const activities = useActivityVersion();
  return useMemo(() => {
    void coverageVersion;
    void meals;
    void workoutsV;
    void activities;
    if (!userId) return { avgKcal: null, avgProteinG: null, workouts: 0, km: 0, loggedDays: 0, completeDays: 0, lifetimeWorkouts: 0 };
    const start = addDays(today, -6);
    const intake = dayIntake(userId, start, today);
    const avg = (f: (d: (typeof intake)[number]) => number) =>
      intake.length ? intake.reduce((s, d) => s + f(d), 0) / intake.length : null;
    return {
      avgKcal: avg((d) => d.kcal),
      avgProteinG: avg((d) => d.proteinG),
      workouts: workoutCounts(userId, start, today).workouts,
      km: activityDistanceM(userId, start, today) / 1000,
      loggedDays: intake.length,
      completeDays: completeIntake(userId, start, today).length,
      lifetimeWorkouts: workoutCounts(userId, "1970-01-01", today).workouts,
    };
  }, [userId, today, meals, workoutsV, activities, coverageVersion]);
}
