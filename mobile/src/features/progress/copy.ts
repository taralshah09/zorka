// Check-in, trend and streak copy (D50 wording, accepted at the P28 gate). DESIGN.md §8.1 number formats.
import type { Goal } from "@/core/api/types";
import { formatInt, formatKg, formatShortDate } from "@/features/targets/format";
import { addDays, type TrendPoint } from "@shared/domain/progress";
import { MAX_WEEKLY_CHANGE_KCAL, MIN_LOGGED_DAYS, goalHasPace } from "@shared/domain/targets";
import type { PendingCheckin } from "./checkins";

/** Trend moves under this (kg) read as "steady". */
const STEADY_KG = 0.05;
/** The scale is worth mentioning when it disagrees with the trend by at least this much. */
const SCALE_NOTE_KG = 0.2;

/** "down 0.4 kg" · "up 0.3 kg" · "steady" */
export function trendWords(changeKg: number): string {
  if (Math.abs(changeKg) < STEADY_KG) return "steady";
  return `${changeKg < 0 ? "down" : "up"} ${formatKg(Math.abs(changeKg))} kg`;
}

/** "▼0.4" · "▲0.3" · "±0" for chart labels. */
export function trendArrow(changeKg: number): string {
  if (Math.abs(changeKg) < STEADY_KG) return "±0";
  return `${changeKg < 0 ? "▼" : "▲"}${formatKg(Math.abs(changeKg))}`;
}

const signedKg = (kg: number) => `${kg > 0 ? "+" : kg < 0 ? "−" : "±"}${formatKg(Math.abs(kg))}`;

export type CheckinCopy = { title: string; body: string; notes: string[] };

/** S35 copy for the three variants: Simple, Detailed (geek) and Not enough data. */
export function checkinCopy(p: PendingCheckin, detailed: boolean): CheckinCopy {
  const r = p.result;
  if (r.status === "not_enough_data") {
    const stays = `Target stays at ${formatInt(p.previousKcal)} kcal.`;
    return r.reason === "days"
      ? {
          title: "Not enough data yet",
          body: `Log ${MIN_LOGGED_DAYS} of 7 days to unlock adjustments. You logged ${r.loggedDays} this week. ${stays}`,
          notes: [],
        }
      : {
          title: "Not enough data yet",
          body: `Log your weight at least once a week to unlock adjustments. ${stays}`,
          notes: [],
        };
  }

  const moves = r.changeKcal === 0 ? `stays at ${formatInt(r.newKcal)}` : `moves to ${formatInt(r.newKcal)}`;
  const notes = [
    ...(r.capped ? [`Change capped at ${MAX_WEEKLY_CHANGE_KCAL} kcal.`] : []),
    ...(r.floorApplied ? ["Kept at your minimum safe calories."] : []),
  ];
  if (!detailed) {
    return {
      title: r.onTrack ? "On track ✓" : "Adjusting your plan",
      body: `Trend ${trendWords(r.trendChangeKg)} this week. ${
        r.changeKcal === 0
          ? `Target stays at ${formatInt(r.newKcal)} kcal.`
          : `New target: ${formatInt(r.newKcal)} kcal.`
      }`,
      notes: [],
    };
  }
  const scale =
    p.scaleChangeKg != null && Math.abs(p.scaleChangeKg - r.trendChangeKg) >= SCALE_NOTE_KG
      ? ` The scale says ${signedKg(p.scaleChangeKg)} — daily water swings, not fat.`
      : "";
  return {
    title: r.onTrack ? "On track ✓" : "Adjusting your plan",
    body: `Your trend is ${trendWords(r.trendChangeKg)}.${scale} You burn about ${formatInt(
      Math.round(r.estimatedBurnKcal / 10) * 10,
    )} a day, so your target ${moves}.`,
    notes,
  };
}

export function streakDays(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

/** UX R1 / W2 · What "trend" means, said once where the trend is shown. */
export const TREND_EXPLAINED =
  "Your trend smooths out day-to-day swings from water and food, so it shows where your weight is really heading.";

/** Past this many weeks an "on pace for … by …" date is too far out to be useful. */
const MAX_PACE_WEEKS = 104;

const upDown = (kg: number) => `${kg < 0 ? "Down" : "Up"} ${formatKg(Math.abs(kg))} kg this week`;

/**
 * UX R1 · Progress opens with one plain answer to "how am I doing?": this week's change and, with a target, when
 * the user gets there at this pace. `sub` adds the one fact that matters next.
 */
export function progressVerdict(input: {
  latest: TrendPoint | null;
  weekChange: number | null;
  goal: Goal | null;
  targetKg: number | null;
  today: string;
}): { line: string; sub: string | null } {
  const { latest, weekChange, goal, today } = input;
  if (!latest) return { line: "No weigh-ins yet", sub: "Log your weight to see how you're doing." };
  const now = latest.trendKg;
  if (weekChange == null)
    return { line: `${formatKg(now)} kg so far`, sub: "Your first weekly change shows after a week of weigh-ins." };

  const target = goal && goalHasPace(goal) ? input.targetKg : null;
  const steady = Math.abs(weekChange) < STEADY_KG;
  if (target == null) {
    if (steady) return { line: `Steady at ${formatKg(now)} kg this week`, sub: "Right where you want it." };
    return { line: upDown(weekChange), sub: "Small swings are normal. Watch the trend over a few weeks." };
  }

  const toGo = target - now;
  const reached = goal === "lose_fat" ? toGo >= 0 : toGo <= 0;
  if (reached)
    return {
      line: steady ? `Steady at ${formatKg(now)} kg` : upDown(weekChange),
      sub: `You've reached your ${formatKg(target)} kg goal.`,
    };
  const left = `${formatKg(Math.abs(toGo))} kg to your ${formatKg(target)} kg goal.`;
  if (steady) return { line: `Steady at ${formatKg(now)} kg this week`, sub: left };
  if (Math.sign(weekChange) !== Math.sign(toGo))
    return { line: upDown(weekChange), sub: `${left} One week is often noise; see where next week lands.` };
  const weeks = Math.abs(toGo / weekChange);
  if (weeks > MAX_PACE_WEEKS) return { line: upDown(weekChange), sub: left };
  return {
    line: `${upDown(weekChange)}, on pace for ${formatKg(target)} kg by ${formatShortDate(addDays(today, Math.ceil(weeks * 7)))}`,
    sub: null,
  };
}
