// Read-only queries across the local stores (meals, weigh-ins, workouts, activities) for the progress engine:
// the weekly check-in (P28), phase stats (P29) and the streak (P30). Nothing here writes.
import { getDb } from "@/core/storage/db";
import { routePoints } from "@/features/activity/store";
import { routeStats } from "@shared/domain/activity";
import type { DayIntake } from "@shared/domain/progress";

/** kcal and protein eaten per day, for days with at least one logged food item. Oldest first. */
export function dayIntake(userId: string, start: string, end: string): DayIntake[] {
  return getDb().getAllSync<DayIntake>(
    `SELECT m.local_date AS date, SUM(i.kcal) AS kcal, SUM(i.protein_g) AS proteinG
       FROM meal_logs m JOIN meal_items i ON i.meal_id = m.id
      WHERE m.user_id = ? AND m.deleted = 0 AND m.local_date BETWEEN ? AND ?
      GROUP BY m.local_date ORDER BY m.local_date`,
    userId,
    start,
    end,
  );
}

/** Finished workouts and the sets that broke a record (D39) in the range. */
export function workoutCounts(userId: string, start: string, end: string): { workouts: number; prs: number } {
  const db = getDb();
  const workouts =
    db.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM workouts
        WHERE user_id = ? AND status = 'done' AND deleted = 0 AND local_date BETWEEN ? AND ?`,
      userId,
      start,
      end,
    )?.n ?? 0;
  const prs =
    db.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM workout_sets s
         JOIN workout_exercises e ON e.id = s.workout_exercise_id
         JOIN workouts w ON w.id = e.workout_id
        WHERE w.user_id = ? AND w.status = 'done' AND w.deleted = 0 AND w.local_date BETWEEN ? AND ?
          AND s.done = 1 AND s.pr_kinds <> '[]'`,
      userId,
      start,
      end,
    )?.n ?? 0;
  return { workouts, prs };
}

/** Distance of finished GPS activities in the range, from their stored routes. */
export function activityDistanceM(userId: string, start: string, end: string): number {
  return getDb()
    .getAllSync<{ id: string }>(
      `SELECT id FROM activities WHERE user_id = ? AND status = 'done' AND local_date BETWEEN ? AND ?`,
      userId,
      start,
      end,
    )
    .reduce((sum, a) => sum + routeStats(routePoints(a.id)).distanceM, 0);
}

/**
 * Every local day with a manual log (D52): a meal, a weigh-in, a finished workout or a finished GPS activity.
 * Health Connect steps don't count.
 */
export function loggedDates(userId: string): string[] {
  return getDb()
    .getAllSync<{ d: string }>(
      `SELECT local_date AS d FROM meal_logs WHERE user_id = ? AND deleted = 0
       UNION SELECT local_date FROM weight_logs WHERE user_id = ? AND deleted = 0
       UNION SELECT local_date FROM workouts WHERE user_id = ? AND status = 'done' AND deleted = 0
       UNION SELECT local_date FROM activities WHERE user_id = ? AND status = 'done'
       ORDER BY d`,
      userId,
      userId,
      userId,
      userId,
    )
    .map((r) => r.d);
}
