// The active user's targets. The plan is derived from the profile (D26); since P28/P29 an active phase with its
// own targets, or an accepted weekly check-in, takes over from it (features/progress/checkins.ts). Since P33 an ease
// from the Gap Closer lowers today's kcal (D57/D58), never below the floor.
import { useMemo } from "react";

import { useEase } from "@/features/gap/eases";
import { effectiveTargets, useCheckins } from "@/features/progress/checkins";
import { usePhases } from "@/features/progress/phases";
import { useActiveUser } from "@/features/users/activeUser";
import { useProfile } from "@/features/users/api";
import { localDate } from "@shared/domain/food";
import type { Targets } from "@shared/domain/targets";
import { targetsFromProfile } from "./targetInput";

export { targetInputFromProfile, targetsFromProfile } from "./targetInput";

/** Targets with an ease applied: kcal down by `ease` (not under the floor), protein kept, fat/carbs re-split. */
export function easedTargets(t: Targets, ease: number, weightKg: number): Targets {
  // PA1: legacy compensation schedules no longer lower targets.
  void ease; void weightKg;
  return t;
}

/**
 * The active user's profile query, the targets in force today, and the plan they started from.
 * `source` says where today's targets come from (S12 / S33 copy); `ease` is today's ease in kcal (0 = none).
 */
export function useTargets() {
  const userId = useActiveUser((s) => s.userId);
  const profile = useProfile(userId);
  const phases = usePhases(userId);
  const checkins = useCheckins(userId);
  const day = localDate(new Date());
  const ease = useEase(userId, day);
  const plan = useMemo(() => (profile.data ? targetsFromProfile(profile.data) : null), [profile.data]);
  const effective = useMemo(
    () => (plan && profile.data ? effectiveTargets(plan, profile.data, phases, checkins, day) : null),
    [plan, profile.data, phases, checkins, day],
  );
  const targets = useMemo(
    () => (effective ? easedTargets(effective.targets, ease, profile.data?.weightKg ?? 0) : null),
    [effective, ease, profile.data?.weightKg],
  );
  return { profile, targets, plan, source: effective?.source ?? "plan", ease };
}
