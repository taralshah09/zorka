// Request schemas and response DTOs for /v1/users. Enum values mirror prisma/schema.prisma.
import { z } from "zod";

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
  onboardedAt: string | null;
  updatedAt: string | null;
};

export type UserSummaryDto = { id: string; displayName: string; onboarded: boolean };
