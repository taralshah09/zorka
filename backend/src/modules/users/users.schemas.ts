// Request schemas and response DTOs for /v1/users. Enum values mirror prisma/schema.prisma.
import { z } from "zod";

import { STEP_GOAL_MAX, STEP_GOAL_MIN } from "../../../../shared/domain/targets.js";
import { WATER_GOAL_MAX, WATER_GOAL_MIN } from "../../../../shared/domain/water.js";

export const GOALS = ["lose_fat", "build_muscle", "maintain", "get_fitter"] as const;
export const SEXES = ["male", "female", "unspecified"] as const;
export const ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "active", "very_active"] as const;
export const DIETS = ["veg", "eggetarian", "jain", "non_veg"] as const;
export const PACES = ["gentle", "steady", "ambitious"] as const;
export const COACHES = ["drill_sergeant", "calm_mentor", "desi_legend"] as const;

export const UserIdParams = z.object({ id: z.string().uuid() });

// Sanity bounds only. Product limits (pace cap, calorie floor) are set at the P08 gate.
export const ProfileUpdateBody = z
  .object({
    goal: z.enum(GOALS).nullable(),
    age: z.number().int().min(13).max(100).nullable(),
    sex: z.enum(SEXES).nullable(),
    heightCm: z.number().min(100).max(250).nullable(),
    weightKg: z.number().min(30).max(300).nullable(),
    activityLevel: z.enum(ACTIVITY_LEVELS).nullable(),
    diet: z.enum(DIETS).nullable(),
    targetWeightKg: z.number().min(30).max(300).nullable(),
    pace: z.enum(PACES).nullable(),
    coach: z.enum(COACHES).nullable(),
    /** P18 (D34): ask about oil/ghee for home-cooked food. */
    oilGheePrompt: z.boolean(),
    /** D48: daily step goal. */
    stepGoal: z.number().int().min(STEP_GOAL_MIN).max(STEP_GOAL_MAX),
    /** Daily water goal, in glasses. */
    waterGoalGlasses: z.number().int().min(WATER_GOAL_MIN).max(WATER_GOAL_MAX),
    /** P28 (D50): show the detailed weekly check-in. */
    checkinDetailed: z.boolean(),
    onboardedAt: z.string().datetime().nullable(),
  })
  .partial()
  .strict();

export type ProfileUpdate = z.infer<typeof ProfileUpdateBody>;

export type ProfileDto = {
  userId: string;
  displayName: string;
  goal: (typeof GOALS)[number] | null;
  age: number | null;
  sex: (typeof SEXES)[number] | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: (typeof ACTIVITY_LEVELS)[number] | null;
  diet: (typeof DIETS)[number] | null;
  targetWeightKg: number | null;
  pace: (typeof PACES)[number] | null;
  coach: (typeof COACHES)[number] | null;
  oilGheePrompt: boolean;
  stepGoal: number;
  waterGoalGlasses: number;
  checkinDetailed: boolean;
  onboardedAt: string | null;
  updatedAt: string | null;
};

export type UserSummaryDto = { id: string; displayName: string; onboarded: boolean };
