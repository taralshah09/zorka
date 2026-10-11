// P31 · Today's gap on the phone (D55): targets (incl. any ease) − eaten + activity kcal, and the on-track / under /
// over / done state for the time of day. Used by the Home card (S10), the Gap Closer (S41), the coach and the nudges.
import { useMemo } from "react";

import { cachedSteps } from "@/features/activity/health";
import { dayCredit, useActivityVersion } from "@/features/activity/store";
import { useWorkoutsVersion } from "@/features/gym/store";
import { mealTotals, useDayMeals } from "@/features/meals/store";
import { workoutCounts } from "@/features/progress/queries";
import { useTrend } from "@/features/progress/weights";
import { useTargets } from "@/features/targets/targets";
import { useActiveUser } from "@/features/users/activeUser";
import { localDate, mealTypeForTime, sumMacros } from "@shared/domain/food";
import { computeGap, minuteOfDay, type Gap } from "@shared/domain/gap";
import type { Targets } from "@shared/domain/targets";

export type DayGap = {
  userId: string;
  day: string;
  minute: number;
  gap: Gap;
  targets: Targets;
  burnedKcal: number;
  steps: number | null;
  /** Trend weight, else the onboarding weight (D57). */
  weightKg: number;
  workoutToday: boolean;
  mealNames: string[];
};

/** Pass a ticking clock (useActivityClock) so the state follows the time of day. null until targets exist. */
export function useDayGap(now: number): DayGap | null {
  const userId = useActiveUser((s) => s.userId);
  const { profile, targets } = useTargets();
  const { latest } = useTrend(userId, profile.data);
  const at = new Date(now);
  const day = localDate(at);
  const minute = minuteOfDay(at);
  const meals = useDayMeals(userId, day);
  const activities = useActivityVersion();
  const workouts = useWorkoutsVersion((s) => s.v);

  const credit = useMemo(() => {
    void activities;
    return dayCredit(userId, day);
  }, [userId, day, activities]);
  const workoutToday = useMemo(() => {
    void workouts;
    return userId ? workoutCounts(userId, day, day).workouts > 0 : false;
  }, [userId, day, workouts]);
  const steps = useMemo(() => {
    void activities;
    return cachedSteps(userId, day)?.steps ?? null;
  }, [userId, day, activities]);

  return useMemo(() => {
    if (!userId || !targets) return null;
    const eaten = sumMacros(meals.map(mealTotals));
    const gap = computeGap({
      targets: { kcal: targets.kcal, proteinG: targets.proteinG, carbsG: targets.carbsG, fatG: targets.fatG },
      eaten,
      burnedKcal: credit.kcal,
      minuteOfDay: minute,
    });
    return {
      userId,
      day,
      minute,
      gap,
      targets,
      burnedKcal: credit.kcal,
      steps,
      weightKg: latest?.trendKg ?? profile.data?.weightKg ?? 0,
      workoutToday,
      mealNames: meals.map((m) => m.items.map((i) => i.name).join(", ")),
    };
  }, [userId, targets, meals, credit.kcal, minute, day, steps, latest?.trendKg, profile.data?.weightKg, workoutToday]);
}

export const currentMealType = (now: number) => mealTypeForTime(new Date(now));
