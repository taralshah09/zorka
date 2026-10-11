// P22 · Voice gym entry contracts. Same pipeline as meals (P16): voice note → speech-to-text → AI turns it
// into sets { exercise, weight, unit, reps, seconds, meters, sets, confidence } → match against the
// exercise list → the phone adds the sets to the open workout.
import { z } from "zod";

import type { SetValues } from "../../../../shared/domain/gym.js";
import type { ExerciseDto } from "../exercises/exercises.schemas.js";
import { AUDIO_TYPES, MAX_AUDIO_BASE64 } from "../mealParse/parse.schemas.js";

/** Below this confidence a set is "uncertain": added to the workout but not ticked (D41). */
export const GYM_UNCERTAIN_BELOW = 0.7;

export const GymVoiceBody = z
  .object({
    audioBase64: z.string().min(100).max(MAX_AUDIO_BASE64),
    mimeType: z.enum(AUDIO_TYPES),
    /** Exercises already in the workout: preferred when a name is ambiguous ("bench" mid-push-day). */
    preferExerciseIds: z.array(z.string().uuid()).max(40).default([]),
  })
  .strict();

const num = (max: number) => z.coerce.number().min(0).max(max).nullable().catch(null);

/** What we ask the model for. Lenient: a bad field degrades to null, never fails the set. */
export const AiGymSet = z.object({
  exercise: z.string().trim().min(1).max(80),
  weight: num(1000),
  unit: z.string().trim().toLowerCase().max(10).nullable().catch(null),
  reps: num(1000),
  seconds: num(86_400),
  meters: num(1_000_000),
  sets: z.coerce.number().int().min(1).max(10).catch(1),
  confidence: z.coerce.number().min(0).max(1).catch(0.5),
});
export const AiGymParse = z.object({ sets: z.array(AiGymSet).max(20) });
export type AiGymSet = z.infer<typeof AiGymSet>;

export type GymUncertainReason = "low_confidence" | "no_match" | "missing_values";

export type GymParsedSet = {
  /** The exercise as the person said it ("bench"). */
  query: string;
  exercise: ExerciseDto | null;
  matchScore: number | null;
  /** Only the fields the matched exercise's type uses. */
  values: SetValues;
  /** How many identical sets ("3 sets of 10"). */
  count: number;
  confidence: number;
  uncertain: boolean;
  reasons: GymUncertainReason[];
};

export type GymParseResult = {
  transcript: string;
  sets: GymParsedSet[];
  timings: { sttMs: number; aiMs: number; matchMs: number; totalMs: number };
  ai: { slot: string; model: string; attempts: number };
};
