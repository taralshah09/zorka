// The day Today is showing. null follows the real today (so it rolls over at midnight); a past local date is picked
// from the date strip or the goal calendar. New meals and water taps are logged to this day, at the current time of
// day. Kept in memory only: the app opens on today.
import { create } from "zustand";

import { localDate } from "@shared/domain/food";

export const useSelectedDay = create<{ day: string | null }>(() => ({ day: null }));

/** Shows `day` on Today. Today itself (or a future day) goes back to following today. */
export function selectDay(day: string | null, now = new Date()) {
  useSelectedDay.setState({ day: day && day < localDate(now) ? day : null });
}

/** The selected day as a local date, today when none is picked. */
export function selectedDay(now = new Date()): string {
  const day = useSelectedDay.getState().day;
  return day && day < localDate(now) ? day : localDate(now);
}

export function useViewedDay(now: Date): { day: string; isToday: boolean } {
  const picked = useSelectedDay((s) => s.day);
  const today = localDate(now);
  const day = picked && picked < today ? picked : today;
  return { day, isToday: day === today };
}

/** A local date at noon, so day arithmetic is safe across DST changes. */
export const dateOf = (day: string) => new Date(`${day}T12:00:00`);

/** When a new log is stamped: now on today, the selected day at the current time of day on a past day. */
export function logTime(now = new Date()): Date {
  const day = selectedDay(now);
  if (day === localDate(now)) return now;
  const d = dateOf(day);
  d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return d;
}
