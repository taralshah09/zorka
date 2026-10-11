// Workouts (P19–P21). Logged on the phone and synced as entity "workout" once finished (D23). Each
// exercise keeps a snapshot of the exercise's name and type; each set keeps its PR kinds (P20, D39).
import { z } from "zod";

import {
  EXERCISE_TYPES,
  isSetComplete,
  PR_KINDS,
  type ExerciseType,
  type PrKind,
} from "../../../../shared/domain/gym.js";

export const WorkoutSetData = z
  .object({
    id: z.string().uuid(),
    weightKg: z.number().min(0).max(1000).nullable().default(null),
    reps: z.number().int().min(1).max(1000).nullable().default(null),
    durationS: z.number().int().min(1).max(86_400).nullable().default(null),
    distanceM: z.number().positive().max(1_000_000).nullable().default(null),
    completedAt: z.string().datetime({ offset: true }).nullable().default(null),
    /** P20: the records this set broke, worked out on the phone when it was ticked. */
    prKinds: z.array(z.enum(PR_KINDS as [PrKind, ...PrKind[]])).max(5).default([]),
  })
  .strict();

export const WorkoutExerciseData = z
  .object({
    id: z.string().uuid(),
    exerciseId: z.string().uuid().nullable(),
    name: z.string().trim().min(1).max(80),
    type: z.enum(EXERCISE_TYPES),
    sets: z.array(WorkoutSetData).min(1).max(50),
  })
  .strict()
  .superRefine((e, ctx) => {
    e.sets.forEach((s, i) => {
      if (!isSetComplete(e.type, s)) {
        ctx.addIssue({ code: "custom", path: ["sets", i], message: `Set is missing values for ${e.type}` });
      }
    });
  });

export const WorkoutData = z
  .object({
    name: z.string().trim().min(1).max(80),
    startedAt: z.string().datetime({ offset: true }),
    endedAt: z.string().datetime({ offset: true }),
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** P21: the routine it was started from. */
    routineId: z.string().uuid().nullable().default(null),
    exercises: z.array(WorkoutExerciseData).min(1).max(40),
  })
  .strict()
  .refine((w) => new Date(w.endedAt).getTime() >= new Date(w.startedAt).getTime(), {
    message: "endedAt is before startedAt",
    path: ["endedAt"],
  });
export type WorkoutData = z.infer<typeof WorkoutData>;

export const WorkoutsQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });

export type WorkoutSetDto = {
  id: string;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
  completedAt: string | null;
  prKinds: PrKind[];
};

export type WorkoutDto = {
  id: string;
  name: string;
  startedAt: string;
  endedAt: string;
  localDate: string;
  routineId: string | null;
  clientUpdatedAt: string;
  exercises: { id: string; exerciseId: string | null; name: string; type: ExerciseType; sets: WorkoutSetDto[] }[];
};
