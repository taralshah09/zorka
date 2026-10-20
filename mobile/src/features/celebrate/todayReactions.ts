// Today's small reactions (on top of S47's big moments): a confetti burst once per goal reached today — calories on
// target, protein, steps — and a mascot eye-roll when the day goes over target or the streak is at risk. When every
// goal is hit, S47 ("All goals hit!") already celebrates, so the single-goal bursts stay quiet.
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

import type { LineSituation } from "@/features/coach/lines";
import type { DayGap } from "@/features/gap/gap";
import { DONE_PROTEIN_SHARE, OVER_TOLERANCE_KCAL } from "@shared/domain/gap";
import { burstOnce } from "./ConfettiBurst";


/** Pass `userId` only while today is on show (not a past day picked on the date strip). */
export function useTodayReactions(
  userId: string | null,
  day: string,
  dg: DayGap | null,
  stepGoal: number | null,
  situation: LineSituation | null,
) {
  const g = dg?.gap ?? null;
  const kcalHit = !!g && g.budget.kcal > 0 && Math.abs(g.remaining.kcal) <= OVER_TOLERANCE_KCAL;
  const proteinHit = !!g && g.budget.proteinG > 0 && g.eaten.proteinG >= DONE_PROTEIN_SHARE * g.budget.proteinG;
  const stepsHit = !!dg?.steps && !!stepGoal && dg.steps >= stepGoal;
  const allDone = g?.state === "done";
  const dgDay = dg?.day ?? null;

  useFocusEffect(
    useCallback(() => {
      if (!userId || dgDay !== day) return;
      if (!allDone && dg?.coverage === "complete") {
        // One burst per focus at most; the others fire on the next visit.
        if (proteinHit && burstOnce(userId, `goal:protein:${day}`)) return;
        if (kcalHit && burstOnce(userId, `goal:kcal:${day}`)) return;
        if (stepsHit && burstOnce(userId, `goal:steps:${day}`)) return;
      }
    }, [userId, dgDay, day, allDone, proteinHit, kcalHit, stepsHit, dg?.coverage]),
  );
  void situation;
}
