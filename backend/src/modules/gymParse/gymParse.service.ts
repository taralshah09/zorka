// P22 · Voice gym entry. Voice note → speech-to-text → AI sets → exercise match. Nothing is saved here:
// the phone adds the sets to the open workout (ticked when certain, unticked to check when not).
import {
  categoryFromWords,
  cleanMusclewikiUrl,
  isSetComplete,
  lbToKg,
  onlyMuscleWords,
  valuesFor,
  type ExerciseCategory,
  type SetValues,
} from "../../../../shared/domain/gym.js";
import { ROUTINE_DEFAULT_REPS, ROUTINE_DEFAULT_SETS, ROUTINE_MAX_SETS } from "../../../../shared/domain/assistant.js";
import { matchScore, MIN_MATCH_SCORE } from "../../../../shared/domain/foodMatch.js";
import { notFound } from "../../http/errors.js";
import type { AiClient } from "../ai/ai.client.js";
import type { ExerciseRecord } from "../exercises/exercises.repository.js";
import type { ExerciseDto } from "../exercises/exercises.schemas.js";
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

/** A name match this good is the exercise asked about, even when the words also name a muscle ("back squat"). */
export const EXERCISE_REF_STRONG = 0.75;
/** Exercises listed for a muscle ("exercises for chest"). */
export const EXERCISE_REF_MAX = 3;

const STOP_WORDS = /\b(how|to|do|does|a|an|the|for|my|me|show|exercise|exercises|workout|workouts|best|good|some|form|proper|technique|video|musclewiki|muscle|wiki|on|of|with|ka|ke|ki|kaise|karu|karein)\b/g;

export type ExerciseLookup = {
  query: string;
  category: ExerciseCategory | null;
  matches: { id: string; name: string; category: ExerciseCategory; url: string | null }[];
};

/**
 * AB · exercise_ref. Words → exercises from the user's list (curated + their own), each with its MuscleWiki page (D38).
 * A strong name match wins; else a muscle ("quads", "chest") lists up to three of that category, the ones the user does
 * first; else a weaker name match; else nothing (the phone offers MuscleWiki's own search). No AI: the list is the source.
 */
export function lookupExercises(words: string, catalog: readonly ExerciseRecord[], recentNames: readonly string[] = []): ExerciseLookup {
  const query = words.replace(/\s+/g, " ").trim();
  const name = query.toLowerCase().replace(STOP_WORDS, " ").replace(/\s+/g, " ").trim();
  const ref = (e: ExerciseRecord) => ({ id: e.id, name: e.name, category: e.category, url: e.referenceUrl ? cleanMusclewikiUrl(e.referenceUrl) : null });
  const category = categoryFromWords(query);
  // "quads" alone is the muscle, even when an exercise's alias says it too.
  const match = name && !(category && onlyMuscleWords(name)) ? matchExercise(name, catalog, new Set()) : null;
  if (match && (match.score >= EXERCISE_REF_STRONG || !category)) return { query, category: match.exercise.category, matches: [ref(match.exercise)] };
  if (category) {
    const recent = recentNames.map((n) => n.toLowerCase());
    const rank = (e: ExerciseRecord) => {
      const i = recent.indexOf(e.name.toLowerCase());
      return i < 0 ? recent.length : i;
    };
    const inCategory = catalog.filter((e) => e.category === category && e.referenceUrl);
    const picked = [...inCategory].sort((a, b) => rank(a) - rank(b)).slice(0, EXERCISE_REF_MAX);
    return { query, category, matches: picked.map(ref) };
  }
  return { query, category: null, matches: [] };
}

/**
 * create_routine · Parsed sets → a routine's exercises: one per matched exercise (said twice: the first wins), sets
 * from "3 sets of 10" (else the editor's 3), reps when said (else 10; none for holds and cardio).
 */
export function routineFromSets(sets: readonly GymParsedSet[]): {
  exercises: { exercise: ExerciseDto; targetSets: number; targetReps: number | null }[];
  unmatched: string[];
} {
  const exercises: { exercise: ExerciseDto; targetSets: number; targetReps: number | null }[] = [];
  const unmatched: string[] = [];
  for (const s of sets) {
    if (!s.exercise) {
      unmatched.push(s.query);
      continue;
    }
    if (exercises.some((e) => e.exercise.id === s.exercise!.id)) continue;
    const counted = s.exercise.type === "weight_reps" || s.exercise.type === "reps";
    exercises.push({
      exercise: s.exercise,
      targetSets: Math.min(ROUTINE_MAX_SETS, s.count > 1 ? s.count : ROUTINE_DEFAULT_SETS),
      targetReps: counted ? (s.values.reps ?? ROUTINE_DEFAULT_REPS) : null,
    });
  }
  return { exercises, unmatched };
}

export function gymParseService(ai: AiClient, exercises: ExercisesService, userExists: (id: string) => Promise<boolean>) {
  return {
    /** AB · exercise_ref: the user's exercise list, searched by name or muscle. The caller has already checked the user. */
    async findExercises(userId: string, words: string, recentNames: readonly string[] = []): Promise<ExerciseLookup> {
      return lookupExercises(words, await exercises.candidates(userId), recentNames);
    },

    /** AB2 · The assistant's log_workout: words already transcribed → sets. The caller has already checked the user. */
    async parseText(userId: string, text: string, preferExerciseIds: readonly string[] = []): Promise<{ sets: GymParsedSet[]; ai: GymParseResult["ai"] }> {
      const catalogP = exercises.candidates(userId);
      catalogP.catch(() => {});
      const { value, meta } = await ai.json({ system: GYM_SYSTEM, user: gymUser(text), schema: AiGymParse });
      const catalog = await catalogP;
      const prefer = new Set(preferExerciseIds);
      return {
        sets: value.sets.map((s) => resolveSet(s, catalog, prefer)),
        ai: { slot: meta.slot, model: meta.model, attempts: meta.attempts },
      };
    },

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
