// P21 · Routines on the phone (S22 cards, S26 editor). Local-first (D23), synced as entity "routine".
// A routine is a named list of exercises with target sets × reps; starting one opens a workout with those
// exercises and that many set rows.
import { randomUUID } from "expo-crypto";
import { useMemo } from "react";
import { create } from "zustand";

import type { Exercise } from "@/core/api/types";
import { getDb } from "@/core/storage/db";
import { notifyLocalWrite, onAcknowledged, useSyncStatus } from "@/core/sync/engine";
import { enqueue } from "@/core/sync/outbox";
import { onPulled } from "@/core/sync/pull";
import type { ExerciseCategory, ExerciseType } from "@shared/domain/gym";
import { addExercises, startWorkout, useWorkoutsVersion, type Workout } from "./store";

export type RoutineExercise = {
  id: string;
  exerciseId: string | null;
  name: string;
  type: ExerciseType;
  /** Display snapshot (icon tile, card subtitle). Not synced. */
  category: ExerciseCategory | null;
  targetSets: number;
  /** null for holds and cardio. */
  targetReps: number | null;
};

export type Routine = { id: string; userId: string; name: string; exercises: RoutineExercise[]; synced: boolean };

export const useRoutinesVersion = create<{ v: number }>(() => ({ v: 0 }));
const bump = () => useRoutinesVersion.setState((s) => ({ v: s.v + 1 }));

onAcknowledged("routine", (row) => {
  getDb().runSync(
    `UPDATE routines SET synced = 1 WHERE id = ? AND client_updated_at = ?`,
    row.record_id,
    row.client_updated_at,
  );
});

type RoutineRow = { id: string; user_id: string; name: string; exercises: string; synced: number };

const toRoutine = (r: RoutineRow): Routine => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  exercises: JSON.parse(r.exercises) as RoutineExercise[],
  synced: !!r.synced,
});

export const listRoutines = (userId: string): Routine[] =>
  getDb()
    .getAllSync<RoutineRow>(
      `SELECT * FROM routines WHERE user_id = ? AND deleted = 0 ORDER BY name COLLATE NOCASE`,
      userId,
    )
    .map(toRoutine);

export function getRoutine(id: string): Routine | null {
  const row = getDb().getFirstSync<RoutineRow>(`SELECT * FROM routines WHERE id = ? AND deleted = 0`, id);
  return row ? toRoutine(row) : null;
}

export function saveRoutine(
  userId: string,
  input: { id?: string | null; name: string; exercises: RoutineExercise[] },
): Routine {
  const id = input.id ?? randomUUID();
  const now = new Date().toISOString();
  const name = input.name.trim();
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT OR REPLACE INTO routines (id, user_id, name, exercises, client_updated_at, deleted, synced)
       VALUES (?, ?, ?, ?, ?, 0, 0)`,
      id,
      userId,
      name,
      JSON.stringify(input.exercises),
      now,
    );
    enqueue({
      op_id: randomUUID(),
      user_id: userId,
      entity: "routine",
      action: "upsert",
      record_id: id,
      payload: JSON.stringify({
        name,
        exercises: input.exercises.map(({ category: _c, ...e }) => e),
      }),
      client_updated_at: now,
    });
  });
  bump();
  notifyLocalWrite();
  return getRoutine(id)!;
}

export function deleteRoutine(r: Routine): void {
  const now = new Date().toISOString();
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync(`UPDATE routines SET deleted = 1, synced = 0, client_updated_at = ? WHERE id = ?`, now, r.id);
    enqueue({
      op_id: randomUUID(),
      user_id: r.userId,
      entity: "routine",
      action: "delete",
      record_id: r.id,
      payload: null,
      client_updated_at: now,
    });
  });
  bump();
  notifyLocalWrite();
}

// ── Pull ───────────────────────────────────────────────────────────────────────────────────────

onPulled("routine", {
  apply(userId, { id, deleted, data }) {
    const db = getDb();
    const local = db.getFirstSync<{ synced: number; client_updated_at: string; exercises: string }>(
      `SELECT synced, client_updated_at, exercises FROM routines WHERE id = ?`,
      id,
    );
    if (local && !local.synced) return; // an unsynced local edit wins until the outbox has pushed it
    if (deleted) {
      db.runSync(`DELETE FROM routines WHERE id = ?`, id);
      return;
    }
    const r = data as { name: string; clientUpdatedAt: string; exercises: Omit<RoutineExercise, "category">[] };
    if (local?.client_updated_at === r.clientUpdatedAt) return;
    // category is a local display snapshot: keep this phone's, else take the cached exercise's.
    const kept = new Map(
      (local ? (JSON.parse(local.exercises) as RoutineExercise[]) : []).map((e) => [e.id, e.category]),
    );
    const cached = (exerciseId: string | null) =>
      exerciseId
        ? (db.getFirstSync<{ category: ExerciseCategory | null }>(
            `SELECT json_extract(data, '$.category') AS category FROM exercises WHERE id = ?`,
            exerciseId,
          )?.category ?? null)
        : null;
    const exercises: RoutineExercise[] = r.exercises.map((e) => ({
      ...e,
      targetReps: e.targetReps ?? null,
      category: kept.get(e.id) ?? cached(e.exerciseId),
    }));
    db.runSync(
      `INSERT OR REPLACE INTO routines (id, user_id, name, exercises, client_updated_at, deleted, synced)
       VALUES (?, ?, ?, ?, ?, 0, 1)`,
      id,
      userId,
      r.name,
      JSON.stringify(exercises),
      r.clientUpdatedAt,
    );
  },

  requeueMissing(userId, onServer) {
    const missing = listRoutines(userId).filter((r) => r.synced && !onServer.has(r.id));
    for (const r of missing) saveRoutine(userId, r);
    return missing.length;
  },

  changed: bump,
});

/**
 * Opens a workout from a routine. Exercises missing from this phone's list (e.g. a deleted custom one) are
 * left out. Returns null when another workout is already open (the caller offers to resume it).
 */
export function startRoutine(
  userId: string,
  r: Routine,
  lookup: (id: string | null) => Exercise | null,
): Workout | null {
  const before = startWorkout(userId, { name: r.name, routineId: r.id });
  if (before.routineId !== r.id || before.exercises.length) return null;
  addExercises(
    before,
    r.exercises.flatMap((e) => {
      const exercise = lookup(e.exerciseId);
      return exercise ? [{ exercise, targetSets: e.targetSets, targetReps: e.targetReps }] : [];
    }),
  );
  return before;
}

/** When each routine was last finished as a workout (S22 "Last: 2d ago"). */
export function routinesLastDone(userId: string): Map<string, string> {
  const rows = getDb().getAllSync<{ routine_id: string; last: string }>(
    `SELECT routine_id, MAX(started_at) AS last FROM workouts
      WHERE user_id = ? AND status = 'done' AND deleted = 0 AND routine_id IS NOT NULL GROUP BY routine_id`,
    userId,
  );
  return new Map(rows.map((r) => [r.routine_id, r.last]));
}

export function useRoutines(userId: string | null): { routines: Routine[]; lastDone: Map<string, string> } {
  const v = useRoutinesVersion((s) => s.v);
  const w = useWorkoutsVersion((s) => s.v);
  const sync = useSyncStatus((s) => s.lastSyncedAt);
  return useMemo(() => {
    void v;
    void w;
    void sync;
    return userId
      ? { routines: listRoutines(userId), lastDone: routinesLastDone(userId) }
      : { routines: [], lastDone: new Map() };
  }, [userId, v, w, sync]);
}

// ── S26 editor draft (survives the trip to the exercise picker and back) ───────────────────────

export const DEFAULT_TARGET_SETS = 3;
export const DEFAULT_TARGET_REPS = 10;

type Draft = { id: string | null; name: string; exercises: RoutineExercise[]; dirty: boolean };

export const useRoutineDraft = create<Draft>(() => ({ id: null, name: "", exercises: [], dirty: false }));

const edit = (fn: (d: Draft) => Partial<Draft>) => useRoutineDraft.setState((d) => ({ ...fn(d), dirty: true }));

export const routineDraft = {
  load(r: Routine | null) {
    useRoutineDraft.setState(
      r
        ? { id: r.id, name: r.name, exercises: r.exercises, dirty: false }
        : { id: null, name: "", exercises: [], dirty: false },
    );
  },
  setName: (name: string) => edit(() => ({ name })),
  /** Adds exercises (skipping ones already in the routine) with the default 3 × 10 (D41). */
  add(list: readonly Exercise[]) {
    edit((d) => ({
      exercises: [
        ...d.exercises,
        ...list
          .filter((x) => !d.exercises.some((e) => e.exerciseId === x.id))
          .map((x) => ({
            id: randomUUID(),
            exerciseId: x.id,
            name: x.name,
            type: x.type,
            category: x.category,
            targetSets: DEFAULT_TARGET_SETS,
            targetReps: x.type === "weight_reps" || x.type === "reps" ? DEFAULT_TARGET_REPS : null,
          })),
      ],
    }));
  },
  remove: (id: string) => edit((d) => ({ exercises: d.exercises.filter((e) => e.id !== id) })),
  move(id: string, by: -1 | 1) {
    edit((d) => {
      const i = d.exercises.findIndex((e) => e.id === id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= d.exercises.length) return {};
      const next = [...d.exercises];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return { exercises: next };
    });
  },
  setTarget: (id: string, patch: Partial<Pick<RoutineExercise, "targetSets" | "targetReps">>) =>
    edit((d) => ({ exercises: d.exercises.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
};
