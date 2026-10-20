// P33 · "Tomorrow's target eases by 150" (D57/D58). Phone only: one row per profile and day, never synced. An ease lowers
// that day's kcal target (protein kept, fat/carbs re-split), never below the calorie floor (applied in useTargets).
import { useMemo } from "react";
import { create } from "zustand";


export const useEasesVersion = create<{ v: number }>(() => ({ v: 0 }));

export function easeFor(userId: string | null, date: string): number {
  void userId; void date;
  return 0;
}

/** Eases the `days` days after `today` by `perDay` each; a day never eases more than EASE_MAX_PER_DAY in total. */
export function addEase(userId: string, today: string, perDay: number, days: number): void {
  // PA1: compensation is retired; keep the API for old screens without creating new schedules.
  void userId; void today; void perDay; void days;
  return;
}

/** Days from `today` on that already have an ease (S41 says so instead of offering it again). */
export function upcomingEases(userId: string | null, today: string): { date: string; kcal: number }[] {
  void userId; void today;
  return [];
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
