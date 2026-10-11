// P38 · Share card data (DESIGN.md §9, brand §14). Five templates: run, PR, perfect day, phase complete, streak
// milestone. Each builder turns domain data into one neutral card spec (no coach voice, no names unless the user
// turns them on); ShareCard renders every spec with the same layout.
import type { Gap } from "@shared/domain/gap";
import {
  ACTIVITY_LABEL,
  calories,
  clockLabel,
  MET,
  paceLabel,
  routeStats,
  type Activity,
  type RoutePoint,
} from "@shared/domain/activity";
import { e1rm, formatSet, PR_LABEL, type ExerciseType, type PrKind, type SetValues } from "@shared/domain/gym";
import type { PhaseSummary } from "@shared/domain/progress";
import type { Streak } from "@shared/domain/streak";
import { formatInt, formatKg } from "@/features/targets/format";

export type ShareKind = "run" | "pr" | "day" | "phase" | "streak";

export type ShareStat = { label: string; value: string; unit?: string };

export type ShareCardSpec = {
  key: string;
  kind: ShareKind;
  /** Upper-case eyebrow: RUN, PR, PERFECT DAY, PHASE COMPLETE, 30-DAY STREAK. */
  eyebrow: string;
  /** The display-xl hero number + unit in lime. */
  hero: { value: string; unit: string };
  /** Optional line under the hero (exercise or phase name). */
  title?: string;
  /** 2–3 supporting stats. */
  stats: ShareStat[];
  /** "12 Oct 2026" */
  date: string;
  /** Runs only: the route, drawn as a lilac line. */
  route?: readonly RoutePoint[];
  /** What a screen reader says for the whole card. */
  a11y: string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-12" → "12 Oct 2026" (always with the year: a shared image outlives the week it was made). */
export function cardDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const signedKg = (kg: number) => `${kg < 0 ? "−" : kg > 0 ? "+" : ""}${formatKg(Math.abs(kg))}`;

export function runCard(a: Activity, points: readonly RoutePoint[]): ShareCardSpec {
  const stats = routeStats(points);
  const seconds = a.elapsedMs / 1000;
  const km = stats.distanceM / 1000;
  const kcal = Math.round(calories(MET[a.kind], a.weightKg, seconds));
  const speed = seconds > 0 ? km / (seconds / 3600) : 0;
  const label = ACTIVITY_LABEL[a.kind];
  return {
    key: `run:${a.id}`,
    kind: "run",
    eyebrow: label.toUpperCase(),
    hero: { value: km.toFixed(2), unit: "km" },
    stats: [
      { label: "Time", value: clockLabel(seconds) },
      a.kind === "ride"
        ? { label: "Avg speed", value: speed.toFixed(1), unit: "km/h" }
        : { label: "Pace", value: paceLabel(seconds, stats.distanceM).replace(" /km", ""), unit: "/km" },
      { label: "Energy", value: `≈ ${formatInt(kcal)}`, unit: "kcal" },
    ],
    date: cardDate(a.localDate),
    route: points,
    a11y: `${label}, ${km.toFixed(2)} kilometres in ${clockLabel(seconds)}, ${cardDate(a.localDate)}`,
  };
}

/** The kind that leads the card when one set broke several records. */
const PR_ORDER: readonly PrKind[] = ["weight", "e1rm", "distance", "time", "reps"];

export type PrInput = {
  setId: string;
  exerciseName: string;
  type: ExerciseType;
  set: SetValues & { prKinds: readonly PrKind[] };
  workoutName: string;
  date: string;
};

export function prCard(p: PrInput): ShareCardSpec {
  const lead = PR_ORDER.find((k) => p.set.prKinds.includes(k)) ?? p.set.prKinds[0] ?? "weight";
  const s = p.set;
  const hero =
    lead === "weight" && s.weightKg
      ? { value: formatKg(s.weightKg), unit: "kg" }
      : lead === "e1rm"
        ? { value: formatKg(e1rm(s.weightKg, s.reps) ?? 0), unit: "kg est. 1RM" }
        : lead === "distance" && s.distanceM
          ? { value: (s.distanceM / 1000).toFixed(2), unit: "km" }
          : lead === "time" && s.durationS
            ? { value: clockLabel(s.durationS), unit: "time" }
            : { value: String(s.reps ?? 0), unit: "reps" };
  return {
    key: `pr:${p.setId}`,
    kind: "pr",
    eyebrow: "PR",
    hero,
    title: p.exerciseName,
    stats: [
      { label: "Set", value: formatSet(p.type, s) || "—" },
      { label: "Record", value: p.set.prKinds.map((k) => PR_LABEL[k]).join(" · ") || PR_LABEL[lead] },
      { label: "Workout", value: p.workoutName },
    ],
    date: cardDate(p.date),
    a11y: `Personal record, ${p.exerciseName}, ${hero.value} ${hero.unit}, ${cardDate(p.date)}`,
  };
}

export function dayCard(gap: Gap, day: string, steps: number | null): ShareCardSpec {
  const stats: ShareStat[] = [
    { label: "Protein", value: `${formatInt(gap.eaten.proteinG)} / ${formatInt(gap.budget.proteinG)}`, unit: "g" },
    { label: "Target", value: formatInt(gap.budget.kcal), unit: "kcal" },
  ];
  if (steps != null && steps > 0) stats.push({ label: "Steps", value: formatInt(steps) });
  return {
    key: `day:${day}`,
    kind: "day",
    eyebrow: "PERFECT DAY",
    hero: { value: formatInt(gap.eaten.kcal), unit: "kcal" },
    title: "Every target hit",
    stats,
    date: cardDate(day),
    a11y: `Perfect day, ${formatInt(gap.eaten.kcal)} kcal and ${formatInt(gap.eaten.proteinG)} grams protein, ${cardDate(day)}`,
  };
}

export function phaseCard(
  phase: { id: string; name: string; closedDate: string | null },
  s: PhaseSummary,
  today: string,
): ShareCardSpec {
  const hero =
    s.changeKg != null ? { value: signedKg(s.changeKg), unit: "kg" } : { value: String(s.weeks), unit: "weeks" };
  const stats: ShareStat[] = [
    s.changeKg != null ? { label: "Length", value: String(s.weeks), unit: s.weeks === 1 ? "week" : "weeks" } : null,
    s.avgProteinG != null ? { label: "Avg protein", value: formatInt(s.avgProteinG), unit: "g" } : null,
    { label: "Workouts", value: String(s.workouts) },
    s.distanceKm >= 1 ? { label: "Distance", value: String(+s.distanceKm.toFixed(1)), unit: "km" } : null,
  ]
    .filter((x): x is ShareStat => !!x)
    .slice(0, 3);
  const date = phase.closedDate ?? today;
  return {
    key: `phase:${phase.id}`,
    kind: "phase",
    eyebrow: "PHASE COMPLETE",
    hero,
    title: phase.name,
    stats,
    date: cardDate(date),
    a11y: `Phase complete, ${phase.name}, ${hero.value} ${hero.unit}, ${cardDate(date)}`,
  };
}

/** The milestone the card celebrates: the one reached today, else the current streak itself. */
export function streakCard(streak: Streak, today: string): ShareCardSpec {
  const days = streak.milestoneToday ?? streak.current;
  return {
    key: `streak:${days}`,
    kind: "streak",
    eyebrow: `${days}-DAY STREAK`,
    hero: { value: String(days), unit: days === 1 ? "day" : "days" },
    title: "Logged every day",
    stats: [
      { label: "Best", value: String(streak.best), unit: "days" },
      { label: "Logged days", value: String(streak.days.filter((d) => d.state === "logged").length) },
    ],
    date: cardDate(today),
    a11y: `${days}-day streak, ${cardDate(today)}`,
  };
}
