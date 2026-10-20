// P22 · Voice gym entry: "bench 80 kilos, 8 reps" → a set on the open workout. Reuses the P16 recording
// format (m4a, D32) and the server's speech-to-text; the server turns the words into sets and matches the
// exercise (preferring ones already in the workout). Certain sets are ticked at once (PR check + rest
// timer, like a tap on ✓); uncertain ones are added unticked for the user to check (D41).
import { File } from "expo-file-system";

import { api } from "@/core/api/client";
import type { Exercise, GymParseResult, GymParsedSet } from "@/core/api/types";
import { VOICE_MIME } from "@/features/log/parse";
import { formatSet, isSetComplete, topSet, type PrKind, type SetValues } from "@shared/domain/gym";
import { addExercises, addSet, completeSet, getWorkout, previousSets, updateSet, type Workout } from "./store";

export async function parseGymVoice(
  userId: string,
  uri: string,
  preferExerciseIds: string[],
): Promise<{ result: GymParseResult; clientMs: number }> {
  const audioBase64 = await new File(uri).base64();
  const t0 = Date.now();
  const result = await api<GymParseResult>(`/users/${userId}/workouts/parse-voice`, {
    method: "POST",
    body: { audioBase64, mimeType: VOICE_MIME, preferExerciseIds },
    timeoutMs: 45_000,
  });
  const clientMs = Date.now() - t0;
  if (__DEV__) {
    console.log(
      `[gym-voice] ${clientMs} ms on phone · server ${result.timings.totalMs} ms (stt ${result.timings.sttMs}, ai ${result.timings.aiMs}) via ${result.ai.slot}`,
    );
  }
  return { result, clientMs };
}

export type VoiceOutcome = {
  exerciseName: string;
  values: SetValues;
  count: number;
  ticked: boolean;
  prKinds: PrKind[];
  /** Last session's top numbers for this exercise ("last 77.5 × 8"), shown next to the new set. */
  previous: string | null;
  workoutExerciseId: string;
};

/**
 * Adds parsed sets to a day's workout. Each set fills the next empty row of its exercise (adding the
 * exercise or a row when needed). `lookup` resolves the server's exercise to this phone's copy.
 * Returns what happened per parsed entry, and the entries it couldn't place (no exercise match).
 */
export function applyVoiceSets(
  userId: string,
  workoutId: string,
  sets: readonly GymParsedSet[],
  lookup: (id: string) => Exercise | null,
): { added: VoiceOutcome[]; unmatched: string[] } {
  const added: VoiceOutcome[] = [];
  const unmatched: string[] = [];
  for (const p of sets) {
    const exercise = p.exercise ? (lookup(p.exercise.id) ?? p.exercise) : null;
    let w: Workout | null = getWorkout(workoutId);
    if (!w) break;
    if (!exercise) {
      unmatched.push(p.query);
      continue;
    }
    const [weId] = addExercises(w, [{ exercise }]);
    const tick = !p.uncertain && isSetComplete(exercise.type, p.values);
    const allKinds = new Set<PrKind>();
    for (let n = 0; n < Math.max(1, p.count); n++) {
      w = getWorkout(workoutId)!;
      const we = w.exercises.find((e) => e.id === weId)!;
      const empty = we.sets.find((s) => !s.done && s.weightKg === null && s.reps === null && s.durationS === null);
      const setId = empty?.id ?? addSet(we);
      const fresh = getWorkout(workoutId)!.exercises.find((e) => e.id === weId)!;
      if (tick) {
        completeSet(userId, fresh, setId, p.values)?.forEach((k) => allKinds.add(k));
      } else {
        updateSet(userId, fresh, setId, p.values);
      }
    }
    const best = topSet(exercise.type, previousSets(userId, exercise.id, workoutId));
    added.push({
      exerciseName: exercise.name,
      values: p.values,
      count: p.count,
      ticked: tick,
      prKinds: [...allKinds],
      previous: best ? formatSet(exercise.type, best) || null : null,
      workoutExerciseId: weId!,
    });
  }
  return { added, unmatched };
}
