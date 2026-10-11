// P30 · The streak on the phone (S10 flame, S40). Derived from the local logs every time (D52): nothing is stored or
// synced, so a reinstall that pulls the logs back gets the same streak.
import { useMemo } from "react";

import { useSyncStatus } from "@/core/sync/engine";
import { useActivityVersion } from "@/features/activity/store";
import { useWorkoutsVersion } from "@/features/gym/store";
import { useMealsVersion } from "@/features/meals/store";
import { localDate } from "@shared/domain/food";
import { computeStreak, type Streak } from "@shared/domain/streak";
import { loggedDates } from "./queries";
import { useWeightsVersion } from "./weights";

/**
 * The user's streak as of `now`. Pass a ticking clock (useActivityClock) so "at risk" turns on at 8 PM and a new
 * day starts at midnight; it only recomputes when the day, the hour or the logs change.
 */
export function useStreak(userId: string | null, now: number): Streak | null {
  const meals = useMealsVersion((s) => s.v);
  const weights = useWeightsVersion((s) => s.v);
  const workouts = useWorkoutsVersion((s) => s.v);
  const activities = useActivityVersion();
  const sync = useSyncStatus((s) => s.lastSyncedAt);
  const at = new Date(now);
  const day = localDate(at);
  const hour = at.getHours();
  return useMemo(() => {
    void meals;
    void weights;
    void workouts;
    void activities;
    void sync;
    return userId ? computeStreak(loggedDates(userId), day, hour) : null;
  }, [userId, day, hour, meals, weights, workouts, activities, sync]);
}
