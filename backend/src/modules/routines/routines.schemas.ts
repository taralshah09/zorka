// Routines (P21, S26): a named list of exercises with target sets × reps. Synced as entity "routine" (D23).
import { z } from "zod";

import { EXERCISE_TYPES, type ExerciseType } from "../../../../shared/domain/gym.js";

export const RoutineExerciseData = z
  .object({
    id: z.string().uuid(),
    exerciseId: z.string().uuid().nullable(),
    name: z.string().trim().min(1).max(80),
    type: z.enum(EXERCISE_TYPES),
    targetSets: z.number().int().min(1).max(20),
    targetReps: z.number().int().min(1).max(100).nullable().default(null),
  })
  .strict();

export const RoutineData = z
  .object({
    name: z.string().trim().min(1).max(60),
    exercises: z.array(RoutineExerciseData).min(1).max(30),
  })
  .strict();
export type RoutineData = z.infer<typeof RoutineData>;

export type RoutineDto = {
  id: string;
  name: string;
  clientUpdatedAt: string;
  exercises: {
    id: string;
    exerciseId: string | null;
    name: string;
    type: ExerciseType;
    targetSets: number;
    targetReps: number | null;
  }[];
};
