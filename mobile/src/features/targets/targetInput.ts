// Profile → calculator input. The plan's targets are derived from the profile on the device (D26); the calculator
// itself is shared with the backend (D24).
import type { Profile } from "@/core/api/types";
import { calculateTargets, validateTargetInput, type TargetInput, type Targets } from "@shared/domain/targets";

/** null when the profile is missing a field the calculator needs (e.g. not onboarded yet). */
export function targetInputFromProfile(p: Profile): TargetInput | null {
  const { goal, sex, age, heightCm, weightKg, activityLevel } = p;
  if (!goal || !sex || age == null || heightCm == null || weightKg == null || !activityLevel) return null;
  const input: TargetInput = {
    goal,
    sex,
    age,
    heightCm,
    weightKg,
    activityLevel,
    targetWeightKg: p.targetWeightKg,
    pace: p.pace,
    stepGoal: p.stepGoal,
  };
  return validateTargetInput(input).length ? null : input;
}

export function targetsFromProfile(p: Profile, today = new Date()): Targets | null {
  const input = targetInputFromProfile(p);
  return input ? calculateTargets(input, today) : null;
}
