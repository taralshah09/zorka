// Request schemas and DTOs for exercises (P19 catalog + user-created exercises).
import { z } from "zod";

import {
  cleanMusclewikiUrl,
  EXERCISE_CATEGORIES,
  EXERCISE_TYPES,
  type ExerciseCategory,
  type ExerciseType,
} from "../../../../shared/domain/gym.js";

/** P19: an exercise the user creates on the phone. Synced as entity "custom_exercise" (D23). */
export const CustomExerciseData = z
  .object({
    name: z.string().trim().min(1).max(80),
    category: z.enum(EXERCISE_CATEGORIES),
    type: z.enum(EXERCISE_TYPES),
    /** Optional MuscleWiki page (D38). Anything that isn't an https musclewiki.com link is refused. */
    referenceUrl: z
      .string()
      .max(300)
      .nullable()
      .default(null)
      .transform((v, ctx) => {
        if (v === null || !v.trim()) return null;
        const clean = cleanMusclewikiUrl(v);
        if (!clean) ctx.addIssue({ code: "custom", message: "Only musclewiki.com links are allowed" });
        return clean;
      }),
  })
  .strict();
export type CustomExerciseData = z.infer<typeof CustomExerciseData>;

export type ExerciseDto = {
  id: string;
  name: string;
  aliases: string[];
  category: ExerciseCategory;
  type: ExerciseType;
  referenceUrl: string | null;
  source: string;
  /** true for a user-created exercise. */
  custom: boolean;
  updatedAt: string;
};
