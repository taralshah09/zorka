// The active user's targets. The plan is derived from the profile (D26); since P28/P29 an active phase with its
// own targets, or an accepted weekly check-in, takes over from it (features/progress/checkins.ts).
import { useMemo } from "react";

import { effectiveTargets, useCheckins } from "@/features/progress/checkins";
import { usePhases } from "@/features/progress/phases";
import { useActiveUser } from "@/features/users/activeUser";
import { useProfile } from "@/features/users/api";
import { localDate } from "@shared/domain/food";
import { targetsFromProfile } from "./targetInput";

export { targetInputFromProfile, targetsFromProfile } from "./targetInput";

/**
 * The active user's profile query, the targets in force today, and the plan they started from.
 * `source` says where today's targets come from (S12 / S33 copy).
 */
export function useTargets() {
  const userId = useActiveUser((s) => s.userId);
  const profile = useProfile(userId);
  const phases = usePhases(userId);
  const checkins = useCheckins(userId);
  const day = localDate(new Date());
  const plan = useMemo(() => (profile.data ? targetsFromProfile(profile.data) : null), [profile.data]);
  const effective = useMemo(
    () => (plan && profile.data ? effectiveTargets(plan, profile.data, phases, checkins, day) : null),
    [plan, profile.data, phases, checkins, day],
  );
  return { profile, targets: effective?.targets ?? null, plan, source: effective?.source ?? "plan" };
}
