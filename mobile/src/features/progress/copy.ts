// Check-in, trend and streak copy (D50 wording, accepted at the P28 gate). DESIGN.md §8.1 number formats.
import { formatInt, formatKg } from "@/features/targets/format";
import { MAX_WEEKLY_CHANGE_KCAL, MIN_LOGGED_DAYS } from "@shared/domain/targets";
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
