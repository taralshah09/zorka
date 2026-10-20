// Onboarding answers while the user walks the steps. Nothing goes to the server until "Start today" on the plan
// step (P09 scope: "saved to the profile"), but every change is kept on the phone (UX O4), so an app kill, going back
// to Welcome or being offline doesn't lose them. The saved draft is cleared once the plan is saved or queued.
import { create } from "zustand";

import type { ActivityLevel, CoachId, DietPref, Goal, Pace, Profile, Sex } from "@/core/api/types";
import { kv, KV_KEYS } from "@/core/storage/kv";
import {
  goalHasPace,
  STEP_TARGET,
  SUGGESTED_STEP_GOAL,
  validateTargetInput,
  type TargetInput,
} from "@shared/domain/targets";
import { clampWaterGoal, WATER_GOAL_DEFAULT } from "@shared/domain/water";
import type { BudgetBand, MealSource, WorkPattern } from "@shared/domain/life";
import { DEFAULT_BRIEF_PROMPT_MINUTE } from "@shared/domain/nudges";
import type { StepId } from "./flow";

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
  /** null: not picked, the plan uses the coach recommended for the goal (UX O3). */
  coach: CoachId | null;
  /** null: not set, the plan uses the goal suggested for the activity level (UX O3, F13). */
  stepGoal: number | null;
  /** Daily water goal in glasses. Defaulted; changed on the plan step. */
  waterGoalGlasses: number;
  /** LA1 standing life. null = skipped. */
  mealSource: MealSource | null;
  budget: BudgetBand | null;
  workPattern: WorkPattern | null;
  hasKitchen: boolean | null;
  sessionsPerWeek: number | null;
  /** D73: the evening "How's tomorrow looking?" prompt; null = off. */
  briefPromptMinute: number | null;
  /** The last step the user was on, to pick up from there (UX O4). */
  lastStep: StepId | null;
};

/** Sanity bounds, same as the API (D21). */
export const BOUNDS = {
  age: { min: 13, max: 100 },
  heightCm: { min: 100, max: 250 },
  weightKg: { min: 30, max: 300 },
} as const;

/** UX O3: the coach pre-picked for each goal. Change it on the plan step or later in Settings. */
export const RECOMMENDED_COACH: Record<Goal, CoachId> = {
  lose_fat: "calm_mentor",
  build_muscle: "drill_sergeant",
  maintain: "calm_mentor",
  get_fitter: "desi_legend",
};

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
  stepGoal: null,
  waterGoalGlasses: WATER_GOAL_DEFAULT,
  mealSource: null,
  budget: null,
  workPattern: null,
  hasKitchen: null,
  sessionsPerWeek: null,
  briefPromptMinute: DEFAULT_BRIEF_PROMPT_MINUTE,
  lastStep: null,
};

type DraftState = Draft & {
  /** The profile these answers belong to; the saved draft is only resumed for the same one. */
  userId: string | null;
  /** Starts a fresh draft, prefilled from the profile when redoing setup. */
  start: (userId: string, profile?: Profile | null) => void;
  /** Loads the saved draft for this profile. False when there is none. */
  resume: (userId: string) => boolean;
  update: (patch: Partial<Draft>) => void;
};

const savedKey = (userId: string) => `${KV_KEYS.onboardingDraft}.${userId}`;

/** The saved draft for this profile, when the user got past the first question. */
export function savedDraft(userId: string | null): Draft | null {
  if (!userId) return null;
  try {
    const raw = kv.get(savedKey(userId));
    if (!raw) return null;
    const d = { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) };
    return d.goal ? d : null;
  } catch {
    return null;
  }
}

export function clearSavedDraft(userId: string | null) {
  if (userId) kv.remove(savedKey(userId));
}

const pick = (s: DraftState): Draft => ({
  goal: s.goal,
  age: s.age,
  sex: s.sex,
  heightCm: s.heightCm,
  weightKg: s.weightKg,
  activityLevel: s.activityLevel,
  diet: s.diet,
  targetWeightKg: s.targetWeightKg,
  pace: s.pace,
  coach: s.coach,
  stepGoal: s.stepGoal,
  waterGoalGlasses: s.waterGoalGlasses,
  mealSource: s.mealSource,
  budget: s.budget,
  workPattern: s.workPattern,
  hasKitchen: s.hasKitchen,
  sessionsPerWeek: s.sessionsPerWeek,
  briefPromptMinute: s.briefPromptMinute,
  lastStep: s.lastStep,
});

export const useDraft = create<DraftState>((set, get) => ({
  ...EMPTY,
  userId: null,
  start: (userId, p) => {
    clearSavedDraft(userId);
    set({
      ...EMPTY,
      userId,
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
            // A redo keeps the user's own goals; a first run leaves them to the suggestions.
            stepGoal: p.onboardedAt ? (p.stepGoal ?? STEP_TARGET) : null,
            waterGoalGlasses: clampWaterGoal(p.waterGoalGlasses),
            mealSource: p.mealSource ?? null,
            budget: p.budget ?? null,
            workPattern: p.workPattern ?? null,
            hasKitchen: p.hasKitchen ?? null,
            sessionsPerWeek: p.sessionsPerWeek ?? null,
            briefPromptMinute: p.onboardedAt ? (p.briefPromptMinute ?? null) : DEFAULT_BRIEF_PROMPT_MINUTE,
          }
        : null),
    });
  },
  resume: (userId) => {
    const d = savedDraft(userId);
    if (!d) return false;
    set({ ...d, userId });
    return true;
  },
  update: (patch) => {
    set(patch);
    const s = get();
    if (s.userId) {
      try {
        kv.set(savedKey(s.userId), JSON.stringify(pick(s)));
      } catch {
        // Saving the draft is a convenience; the answers are still in memory.
      }
    }
  },
}));

/** LA1: the standing-life answers for the profile save. Skipped answers go as null. */
export function lifeAnswers(d: Draft) {
  return {
    mealSource: d.mealSource,
    budget: d.budget,
    workPattern: d.workPattern,
    hasKitchen: d.hasKitchen,
    sessionsPerWeek: d.sessionsPerWeek,
    briefPromptMinute: d.briefPromptMinute,
  };
}

/** The coach the plan uses: the user's pick, or the one recommended for the goal. */
export function draftCoach(d: Draft): CoachId | null {
  return d.coach ?? (d.goal ? RECOMMENDED_COACH[d.goal] : null);
}

/** The step goal the plan uses: the user's own, or the one suggested for the activity level. */
export function draftStepGoal(d: Draft): number {
  return d.stepGoal ?? (d.activityLevel ? SUGGESTED_STEP_GOAL[d.activityLevel] : STEP_TARGET);
}

/** UX O2: the target weight offered for a goal, 10% down to lose fat and 5% up to build muscle. */
export function suggestedTargetKg(goal: Goal, weightKg: number): number {
  return Math.round(goal === "lose_fat" ? weightKg * 0.9 : weightKg * 1.05);
}

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
    stepGoal: draftStepGoal(d),
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
