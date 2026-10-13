// Profile → calculator input. The plan's targets are derived from the profile on the device (D26); the calculator
// itself is shared with the backend (D24).
import type { Goal, Profile, ProfileUpdate } from "@/core/api/types";
import {
  calculateTargets,
  goalHasPace,
  validateTargetInput,
  type TargetInput,
  type Targets,
} from "@shared/domain/targets";

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

/**
 * UX N3 / O5 · The profile update for a new goal and target weight, or null when nothing changes or the profile
 * couldn't plan with it (e.g. a "lose fat" target above the profile's weight). Keeps the user's pace, or "steady"
 * when the old goal had none.
 */
export function goalUpdate(p: Profile, goal: Goal, targetWeightKg: number | null): ProfileUpdate | null {
  const paced = goalHasPace(goal);
  const update: ProfileUpdate = {
    goal,
    targetWeightKg: paced ? targetWeightKg : p.targetWeightKg,
    pace: paced ? (p.pace ?? "steady") : p.pace,
  };
  if (update.goal === p.goal && update.targetWeightKg === p.targetWeightKg && update.pace === p.pace) return null;
  return targetInputFromProfile({ ...p, ...update }) ? update : null;
}
