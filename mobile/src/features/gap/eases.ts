// P33 · "Tomorrow's target eases by 150" (D57/D58). Phone only: one row per profile and day, never synced. An ease lowers
// that day's kcal target (protein kept, fat/carbs re-split), never below the calorie floor (applied in useTargets).
import { useMemo } from "react";
import { create } from "zustand";

import { getDb } from "@/core/storage/db";
import { addDays } from "@shared/domain/progress";
import { EASE_MAX_PER_DAY } from "@shared/domain/moveOptions";

export const useEasesVersion = create<{ v: number }>(() => ({ v: 0 }));
const bump = () => useEasesVersion.setState((s) => ({ v: s.v + 1 }));

export function easeFor(userId: string | null, date: string): number {
  if (!userId) return 0;
  return (
    getDb().getFirstSync<{ kcal: number }>(
      `SELECT kcal FROM target_eases WHERE user_id = ? AND local_date = ?`,
      userId,
      date,
    )?.kcal ?? 0
  );
}

/** Eases the `days` days after `today` by `perDay` each; a day never eases more than EASE_MAX_PER_DAY in total. */
export function addEase(userId: string, today: string, perDay: number, days: number): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.withTransactionSync(() => {
    for (let i = 1; i <= days; i++) {
      const date = addDays(today, i);
      const kcal = Math.min(EASE_MAX_PER_DAY, easeFor(userId, date) + Math.max(0, Math.round(perDay)));
      db.runSync(
        `INSERT OR REPLACE INTO target_eases (user_id, local_date, kcal, created_at) VALUES (?, ?, ?, ?)`,
        userId,
        date,
        kcal,
        now,
      );
    }
  });
  bump();
}

/** Days from `today` on that already have an ease (S41 says so instead of offering it again). */
export function upcomingEases(userId: string | null, today: string): { date: string; kcal: number }[] {
  if (!userId) return [];
  return getDb().getAllSync<{ date: string; kcal: number }>(
    `SELECT local_date AS date, kcal FROM target_eases WHERE user_id = ? AND local_date > ? ORDER BY local_date`,
    userId,
    today,
  );
}

export function useEase(userId: string | null, date: string): number {
  const v = useEasesVersion((s) => s.v);
  return useMemo(() => {
    void v;
    return easeFor(userId, date);
  }, [userId, date, v]);
}

export function useUpcomingEases(userId: string | null, today: string) {
  const v = useEasesVersion((s) => s.v);
  return useMemo(() => {
    void v;
    return upcomingEases(userId, today);
  }, [userId, today, v]);
}
