// LA3/LA4 · The targets a day is tracked against. When the day has a saved plan, its kcal, protein and steps replace the
// base (the ledger's share, realistic protein, a busy day's steps); carbs absorb the calorie change so the macros still
// add up. The planner itself always reads the base (useTargets), never this, so a plan never feeds on its own output.
import { useMemo } from "react";

import type { Targets } from "@shared/domain/targets";
import { planFor, useStoredPlan, type StoredPlan } from "./plans";

/** Base targets with the day's plan on top. A day without a step goal (travel, sick) keeps the base step number. */
export function withPlan(base: Targets, stored: StoredPlan | null): Targets {
  const t = stored?.plan?.targets;
  if (!t) return base;
  const kcal = Math.round(t.kcal);
  const proteinG = Math.round(t.proteinG);
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - base.fatG * 9) / 4));
  return { ...base, kcal, proteinG, carbsG, steps: t.steps ?? base.steps };
}

/** The day's water goal: the plan's (raised on a sick day), else the profile's. */
export const waterFor = (stored: StoredPlan | null, fallback: number) => stored?.plan?.targets.waterGlasses ?? fallback;

/** Targets for `date`, re-read when the day's plan changes. */
export function useDayTargets(userId: string | null, date: string, base: Targets | null): Targets | null {
  const stored = useStoredPlan(userId, date);
  return useMemo(() => (base ? withPlan(base, stored) : null), [base, stored]);
}

/** Non-hook form for loops over many days (goal days). */
export const targetsOn = (userId: string, date: string, base: Targets) => withPlan(base, planFor(userId, date));
