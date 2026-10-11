// Onboarding answers while the user walks S03–S09. Kept in memory only: nothing is saved until
// "Start today" on S09 (P09 scope: "saved to the profile").
import { create } from "zustand";

import type { ActivityLevel, CoachId, DietPref, Goal, Pace, Profile, Sex } from "@/core/api/types";
import { goalHasPace, STEP_TARGET, validateTargetInput, type TargetInput } from "@shared/domain/targets";

export type Draft = {
  goal: Goal | null;
  age: number;
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
  diet: DietPref | null;
  targetWeightKg: number | null;
  pace: Pace;
  coach: CoachId | null;
  stepGoal: number;
};

/** Sanity bounds, same as the API (D21). */
export const BOUNDS = {
  age: { min: 13, max: 100 },
  heightCm: { min: 100, max: 250 },
  weightKg: { min: 30, max: 300 },
} as const;

const EMPTY: Draft = {
  goal: null,
  age: 25,
  sex: null,
  heightCm: null,
  weightKg: null,
  activityLevel: null,
  diet: null,
  targetWeightKg: null,
  pace: "steady",
  coach: null,
  stepGoal: STEP_TARGET,
};

type DraftState = Draft & {
  /** Starts a fresh draft, prefilled from the profile when redoing setup. */
  start: (profile?: Profile | null) => void;
  update: (patch: Partial<Draft>) => void;
};

export const useDraft = create<DraftState>((set) => ({
  ...EMPTY,
  start: (p) =>
    set({
      ...EMPTY,
      ...(p
        ? {
            goal: p.goal,
            age: p.age ?? EMPTY.age,
            sex: p.sex,
            heightCm: p.heightCm,
            weightKg: p.weightKg,
            activityLevel: p.activityLevel,
            diet: p.diet,
            targetWeightKg: p.targetWeightKg,
            pace: p.pace ?? EMPTY.pace,
            coach: p.coach,
            stepGoal: p.stepGoal ?? EMPTY.stepGoal,
          }
        : null),
    }),
  update: (patch) => set(patch),
}));

/** Calculator input from the draft, or null while a field is missing or invalid. */
export function draftTargetInput(d: Draft): TargetInput | null {
  if (!d.goal || !d.sex || d.heightCm == null || d.weightKg == null || !d.activityLevel) return null;
  const input: TargetInput = {
    goal: d.goal,
    sex: d.sex,
    age: d.age,
    heightCm: d.heightCm,
    weightKg: d.weightKg,
    activityLevel: d.activityLevel,
    targetWeightKg: goalHasPace(d.goal) ? d.targetWeightKg : null,
    pace: goalHasPace(d.goal) ? d.pace : null,
    stepGoal: d.stepGoal,
  };
  return validateTargetInput(input).length ? null : input;
}

export function inRange(v: number | null, b: { min: number; max: number }): v is number {
  return v != null && Number.isFinite(v) && v >= b.min && v <= b.max;
}

/** Number input text → number (accepts a decimal comma), or null. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
