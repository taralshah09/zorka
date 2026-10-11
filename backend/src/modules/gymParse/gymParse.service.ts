// P22 · Voice gym entry. Voice note → speech-to-text → AI sets → exercise match. Nothing is saved here:
// the phone adds the sets to the open workout (ticked when certain, unticked to check when not).
import { isSetComplete, lbToKg, valuesFor, type SetValues } from "../../../../shared/domain/gym.js";
import { matchScore, MIN_MATCH_SCORE } from "../../../../shared/domain/foodMatch.js";
import { notFound } from "../../http/errors.js";
import type { AiClient } from "../ai/ai.client.js";
import type { ExerciseRecord } from "../exercises/exercises.repository.js";
import { toExerciseDto, type ExercisesService } from "../exercises/exercises.service.js";
import {
  AiGymParse,
  GYM_UNCERTAIN_BELOW,
  type AiGymSet,
  type GymParsedSet,
  type GymParseResult,
  type GymUncertainReason,
} from "./gymParse.schemas.js";
import { GYM_STT_VOCABULARY, GYM_SYSTEM, gymUser } from "./prompts.js";

/** Score bonus for exercises already in the workout, so "incline press" mid-workout picks the incline
 *  press the user is doing (dumbbell vs barbell) rather than the closest name in the whole list. Ties go
 *  to the exercise in the workout. */
export const PREFER_BONUS = 0.15;

export function matchExercise(
  query: string,
  catalog: readonly ExerciseRecord[],
  preferIds: ReadonlySet<string>,
): { exercise: ExerciseRecord; score: number } | null {
  let best: { exercise: ExerciseRecord; score: number } | null = null;
  for (const exercise of catalog) {
    const raw = matchScore(query, exercise);
    if (raw < MIN_MATCH_SCORE) continue;
    const preferred = preferIds.has(exercise.id);
    const score = Math.min(1, raw + (preferred ? PREFER_BONUS : 0));
    if (!best || score > best.score || (score === best.score && preferred)) best = { exercise, score };
  }
  return best;
}

const round = (n: number | null) => (n === null ? null : Math.round(n));

export function resolveSet(ai: AiGymSet, catalog: readonly ExerciseRecord[], preferIds: ReadonlySet<string>): GymParsedSet {
  const reasons: GymUncertainReason[] = [];
  if (ai.confidence < GYM_UNCERTAIN_BELOW) reasons.push("low_confidence");

  const weightKg = ai.weight === null ? null : ai.unit === "lb" ? lbToKg(ai.weight) : ai.weight;
  const said: SetValues = { weightKg, reps: round(ai.reps), durationS: round(ai.seconds), distanceM: ai.meters };

  const match = matchExercise(ai.exercise, catalog, preferIds);
  if (!match) {
    reasons.push("no_match");
    return { query: ai.exercise, exercise: null, matchScore: null, values: said, count: ai.sets, confidence: ai.confidence, uncertain: true, reasons };
  }

  const type = match.exercise.type;
  // "Pull-ups, 10 reps" carries no weight: bodyweight (0 kg) for weight + reps exercises.
  const filled = type === "weight_reps" && said.weightKg === null && said.reps !== null ? { ...said, weightKg: 0 } : said;
  const values = valuesFor(type, filled);
  if (!isSetComplete(type, values)) reasons.push("missing_values");
  return {
    query: ai.exercise,
    exercise: toExerciseDto(match.exercise),
    matchScore: match.score,
    values,
    count: ai.sets,
    confidence: ai.confidence,
    uncertain: reasons.length > 0,
    reasons,
  };
}

export function gymParseService(ai: AiClient, exercises: ExercisesService, userExists: (id: string) => Promise<boolean>) {
  return {
    async parseVoice(
      userId: string,
      audio: { base64: string; mimeType: string },
      preferExerciseIds: readonly string[],
    ): Promise<GymParseResult> {
      const started = Date.now();
      if (!(await userExists(userId))) throw notFound("User");
      const catalogP = exercises.candidates(userId);
      catalogP.catch(() => {}); // awaited below; don't report it as unhandled if the AI call fails first

      const stt = await ai.transcribe(audio, GYM_STT_VOCABULARY);
      const meta = { slot: stt.meta.slot, model: stt.meta.model, attempts: stt.meta.attempts };
      if (!stt.text.replace(/[^a-z0-9]/gi, "")) {
        return { transcript: "", sets: [], timings: { sttMs: stt.meta.ms, aiMs: 0, matchMs: 0, totalMs: Date.now() - started }, ai: meta };
      }

      const { value, meta: aiMeta } = await ai.json({ system: GYM_SYSTEM, user: gymUser(stt.text), schema: AiGymParse });
      const t0 = Date.now();
      const catalog = await catalogP;
      const prefer = new Set(preferExerciseIds);
      const sets = value.sets.map((s) => resolveSet(s, catalog, prefer));
      return {
        transcript: stt.text,
        sets,
        timings: { sttMs: stt.meta.ms, aiMs: aiMeta.ms, matchMs: Date.now() - t0, totalMs: Date.now() - started },
        ai: { slot: aiMeta.slot, model: aiMeta.model, attempts: aiMeta.attempts },
      };
    },
  };
}

export type GymParseService = ReturnType<typeof gymParseService>;
