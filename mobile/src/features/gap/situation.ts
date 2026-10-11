// P33/P37 · Move options and "what's the situation right now" for Home (S10), S41, the coach line and the nudges.
// One place decides the state so the card, the coach and the notifications never disagree.
import { MET } from "@shared/domain/activity";
import { OVER_TOLERANCE_KCAL } from "@shared/domain/gap";
import {
  BRISK_STEPS_PER_MINUTE,
  LOW_ACTIVITY_MINUTE,
  LOW_ACTIVITY_SHARE,
  easePlan,
  isLateNight,
  moveOptions,
  type MoveOption,
} from "@shared/domain/moveOptions";
import type { Streak } from "@shared/domain/streak";
import type { LineFacts, LineSituation } from "@/features/coach/lines";
import type { DayGap } from "./gap";

export function movesFor(dg: DayGap): MoveOption[] {
  return moveOptions({
    remainingKcal: dg.gap.remaining.kcal,
    weightKg: dg.weightKg,
    minuteOfDay: dg.minute,
    met: MET,
    // Tomorrow starts from today's target (an ease already applied today isn't carried over).
    tomorrowKcal: dg.targets.kcal,
    floorKcal: dg.targets.floorKcal,
    steps: dg.steps,
    stepGoal: dg.targets.steps,
    overToleranceKcal: OVER_TOLERANCE_KCAL,
  });
}

export const lowSteps = (dg: DayGap) =>
  dg.steps !== null && dg.minute >= LOW_ACTIVITY_MINUTE && dg.steps < dg.targets.steps * LOW_ACTIVITY_SHARE;

export function lineFacts(dg: DayGap, streak: Streak | null): LineFacts {
  const r = dg.gap.remaining;
  const moves = movesFor(dg);
  const walk = moves.find((m) => m.kind === "activity" && m.activity === "walk");
  const overKcal = Math.max(0, -r.kcal);
  const ease = moves.find((m) => m.kind === "ease") ?? easePlan(overKcal, dg.targets.kcal, dg.targets.floorKcal);
  const stepsLeft = dg.steps === null ? 0 : Math.max(0, dg.targets.steps - dg.steps);
  return {
    proteinLeftG: Math.max(0, r.proteinG),
    kcalLeft: Math.max(0, r.kcal),
    overKcal,
    walkMinutes: walk?.kind === "activity" && !isLateNight(dg.minute) ? walk.minutes : 0,
    walkKcal: walk?.kind === "activity" ? walk.kcal : 0,
    easeKcal: ease && "easePerDay" in ease ? ease.easePerDay : 0,
    streak: streak?.current ?? 0,
    targetKcal: dg.gap.budget.kcal,
    targetProteinG: dg.gap.budget.proteinG,
    stepsLeft,
    walkForSteps: Math.max(10, Math.min(60, Math.ceil(stepsLeft / BRISK_STEPS_PER_MINUTE / 5) * 5)),
  };
}

/** The one situation Home and the coach talk about right now, most urgent first. */
export function situationFor(dg: DayGap, streak: Streak | null, welcomeBack: boolean): LineSituation {
  const g = dg.gap;
  if (welcomeBack) return "welcome_back";
  if (streak?.atRisk) return "streak_risk";
  if (g.state === "over") return isLateNight(dg.minute) ? "over_late" : "over";
  if (g.state === "done") return "done";
  if (g.state === "under") return g.focus === "protein" ? "protein" : "under";
  if (lowSteps(dg)) return "steps";
  if (g.eaten.kcal === 0 && dg.minute < 11 * 60) return "morning";
  return "on_track";
}
