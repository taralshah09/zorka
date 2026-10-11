// Copy helpers for the gym screens (DESIGN.md §8.1: always show the unit).
import type { IconName } from "@/core/icons/Icon";
import { formatClock, formatKg, type Bests, type ExerciseCategory, type ExerciseType } from "@shared/domain/gym";

/** "18,450 kg". */
export const formatVolume = (kg: number) => `${Math.round(kg).toLocaleString("en-IN")} kg`;

/** 2520 → "42 min", 3900 → "1 h 05 min". */
export function formatDuration(totalS: number): string {
  const m = Math.round(totalS / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

/** Elapsed clock for the live workout header ("32:10", "1:02:05"). */
export const formatElapsed = (startedAt: string, now: number) =>
  formatClock((now - new Date(startedAt).getTime()) / 1000);

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Today", "Yesterday", "3d ago", then "12 Sep". */
export function relativeDay(iso: string, now = new Date()): string {
  const days = Math.round((dayStart(now) - dayStart(new Date(iso))) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** "Sat, 11 Oct". */
export const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

/** S23 row: the best that matters for the type ("best 80 kg", "best 25 reps", "best 1:30"). */
export function formatBest(type: ExerciseType, b: Bests): string | null {
  switch (type) {
    case "weight_reps":
      return b.weightKg ? `best ${formatKg(b.weightKg)} kg` : b.reps ? `best ${b.reps} reps` : null;
    case "reps":
      return b.reps ? `best ${b.reps} reps` : null;
    case "time":
      return b.durationS ? `best ${formatClock(b.durationS)}` : null;
    case "distance_time":
      return b.distanceM ? `best ${formatKg(b.distanceM / 1000)} km` : null;
  }
}

/** Icon tile per category (brand §10 style: a tinted symbol, no photos). */
export const CATEGORY_TILE: Record<ExerciseCategory, { icon: IconName; tint: "lime" | "lilac" | "orchid" }> = {
  chest: { icon: "fitness_center", tint: "lilac" },
  back: { icon: "fitness_center", tint: "lilac" },
  shoulders: { icon: "fitness_center", tint: "lilac" },
  biceps: { icon: "fitness_center", tint: "orchid" },
  triceps: { icon: "fitness_center", tint: "orchid" },
  legs: { icon: "fitness_center", tint: "lime" },
  abs: { icon: "self_improvement", tint: "orchid" },
  cardio: { icon: "directions_run", tint: "lime" },
};

/** Column headers for the S24 set table, per type. */
export const SET_COLUMNS: Record<
  ExerciseType,
  { label: string; field: "weightKg" | "reps" | "durationS" | "distanceM" }[]
> = {
  weight_reps: [
    { label: "kg", field: "weightKg" },
    { label: "Reps", field: "reps" },
  ],
  reps: [{ label: "Reps", field: "reps" }],
  time: [{ label: "Sec", field: "durationS" }],
  distance_time: [
    { label: "km", field: "distanceM" },
    { label: "Min", field: "durationS" },
  ],
};
