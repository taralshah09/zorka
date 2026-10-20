// The day Today is showing. null follows the real today (so it rolls over at midnight); a past local date is picked
// from the date strip or the goal calendar, and (LA3) a day up to PLAN_AHEAD_DAYS ahead can be picked to see its plan.
// New meals and water taps are logged to the picked day only when it's a past one: a future pick logs to today.
// Kept in memory only: the app opens on today.
import { create } from "zustand";

import { localDate } from "@shared/domain/food";
import { addDays } from "@shared/domain/progress";

/** How far ahead a day can be looked at: the brief horizon (D73). */
export const PLAN_AHEAD_DAYS = 7;

export const useSelectedDay = create<{ day: string | null }>(() => ({ day: null }));

const lastViewable = (now: Date) => addDays(localDate(now), PLAN_AHEAD_DAYS);

/** Shows `day`: a past day, today (follows today), or a day up to a week ahead (its plan, read-only). */
export function selectDay(day: string | null, now = new Date()) {
  const today = localDate(now);
  useSelectedDay.setState({ day: day && day !== today && day <= lastViewable(now) ? day : null });
}

/** The day new logs go to: the picked day when it's in the past, else today. Never a future day. */
export function selectedDay(now = new Date()): string {
  const day = useSelectedDay.getState().day;
  return day && day < localDate(now) ? day : localDate(now);
}

/** The day being looked at, which may be a future day (read-only). */
export function useViewedDay(now: Date): { day: string; isToday: boolean; isFuture: boolean } {
  const picked = useSelectedDay((s) => s.day);
  const today = localDate(now);
  const day = picked && picked <= lastViewable(now) ? picked : today;
  return { day, isToday: day === today, isFuture: day > today };
}

/** The day logs go to, as a hook: like useViewedDay but a future pick means today. */
export function useLogDay(now: Date): { day: string; isToday: boolean } {
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
