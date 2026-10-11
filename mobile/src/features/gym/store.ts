// Workouts on the phone (P19–P21). Local-first (D23): the open workout lives in SQLite (status 'active') so
// it survives the app being closed, works with no signal, and is never synced half-done. Finishing it
// drops unticked sets, marks it 'done' and queues one "workout" op for the server.
// PRs (P20, D39) are worked out on the phone when a set is ticked, from this phone's history.
import { randomUUID } from "expo-crypto";
import { useMemo } from "react";
import { create } from "zustand";

import type { Exercise } from "@/core/api/types";
import { getDb } from "@/core/storage/db";
import { notifyLocalWrite, onAcknowledged, useSyncStatus } from "@/core/sync/engine";
import { enqueue } from "@/core/sync/outbox";
import { onPulled } from "@/core/sync/pull";
import { localDate } from "@shared/domain/food";
import {
  bestsOf,
  isSetComplete,
  NO_BESTS,
  prsForSequence,
  setVolume,
  topSet,
  valuesFor,
  type Bests,
  type ExerciseCategory,
  type ExerciseType,
  type PrKind,
  type SetValues,
} from "@shared/domain/gym";

export type WorkoutSet = SetValues & {
  id: string;
  position: number;
  done: boolean;
  completedAt: string | null;
  prKinds: PrKind[];
};

export type WorkoutExercise = {
  id: string;
  workoutId: string;
  exerciseId: string | null;
  position: number;
  name: string;
  type: ExerciseType;
  category: ExerciseCategory | null;
  /** From the routine (P21): the reps placeholder when there's no previous session. */
  targetReps: number | null;
  sets: WorkoutSet[];
};

export type Workout = {
  id: string;
  userId: string;
  name: string;
  status: "active" | "done";
  startedAt: string;
  endedAt: string | null;
  localDate: string;
  routineId: string | null;
  synced: boolean;
  exercises: WorkoutExercise[];
};

/** Bumped on every local workout change so hooks re-read. */
export const useWorkoutsVersion = create<{ v: number }>(() => ({ v: 0 }));
const bump = () => useWorkoutsVersion.setState((s) => ({ v: s.v + 1 }));

onAcknowledged("workout", (row) => {
  getDb().runSync(
    `UPDATE workouts SET synced = 1 WHERE id = ? AND client_updated_at = ?`,
    row.record_id,
    row.client_updated_at,
  );
});

// ── Rows ↔ objects ─────────────────────────────────────────────────────────────────────────────

type WorkoutRow = {
  id: string;
  user_id: string;
  name: string;
  status: "active" | "done";
  started_at: string;
  ended_at: string | null;
  local_date: string;
  routine_id: string | null;
  synced: number;
};
type ExerciseRow = {
  id: string;
  workout_id: string;
  exercise_id: string | null;
  position: number;
  name: string;
  type: ExerciseType;
  category: ExerciseCategory | null;
  target_reps: number | null;
};
type SetRow = {
  id: string;
  workout_exercise_id: string;
  position: number;
  weight_kg: number | null;
  reps: number | null;
  duration_s: number | null;
  distance_m: number | null;
  done: number;
  completed_at: string | null;
  pr_kinds: string;
};

const toSet = (r: SetRow): WorkoutSet => ({
  id: r.id,
  position: r.position,
  weightKg: r.weight_kg,
  reps: r.reps,
  durationS: r.duration_s,
  distanceM: r.distance_m,
  done: !!r.done,
  completedAt: r.completed_at,
  prKinds: JSON.parse(r.pr_kinds) as PrKind[],
});

const placeholders = (n: number) => Array(n).fill("?").join(",");

function hydrate(rows: WorkoutRow[]): Workout[] {
  if (!rows.length) return [];
  const db = getDb();
  const exRows = db.getAllSync<ExerciseRow>(
    `SELECT * FROM workout_exercises WHERE workout_id IN (${placeholders(rows.length)}) ORDER BY position`,
    ...rows.map((r) => r.id),
  );
  const setRows = exRows.length
    ? db.getAllSync<SetRow>(
        `SELECT * FROM workout_sets WHERE workout_exercise_id IN (${placeholders(exRows.length)}) ORDER BY position`,
        ...exRows.map((e) => e.id),
      )
    : [];
  return rows.map((w) => ({
    id: w.id,
    userId: w.user_id,
    name: w.name,
    status: w.status,
    startedAt: w.started_at,
    endedAt: w.ended_at,
    localDate: w.local_date,
    routineId: w.routine_id,
    synced: !!w.synced,
    exercises: exRows
      .filter((e) => e.workout_id === w.id)
      .map((e) => ({
        id: e.id,
        workoutId: e.workout_id,
        exerciseId: e.exercise_id,
        position: e.position,
        name: e.name,
        type: e.type,
        category: e.category,
        targetReps: e.target_reps,
        sets: setRows.filter((s) => s.workout_exercise_id === e.id).map(toSet),
      })),
  }));
}

export function getWorkout(id: string): Workout | null {
  const row = getDb().getFirstSync<WorkoutRow>(`SELECT * FROM workouts WHERE id = ? AND deleted = 0`, id);
  return row ? hydrate([row])[0]! : null;
}

export function activeWorkout(userId: string): Workout | null {
  const row = getDb().getFirstSync<WorkoutRow>(
    `SELECT * FROM workouts WHERE user_id = ? AND status = 'active' AND deleted = 0 ORDER BY started_at DESC LIMIT 1`,
    userId,
  );
  return row ? hydrate([row])[0]! : null;
}

// ── Logging ────────────────────────────────────────────────────────────────────────────────────

/** "Morning workout" / "Afternoon workout" / "Evening workout" for an empty workout. */
export function defaultWorkoutName(at: Date): string {
  const h = at.getHours();
  return `${h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening"} workout`;
}

/** Opens a workout. If one is already open it's returned instead (one open workout at a time). */
export function startWorkout(
  userId: string,
  opts: { name?: string; routineId?: string | null; at?: Date } = {},
): Workout {
  const open = activeWorkout(userId);
  if (open) return open;
  const at = opts.at ?? new Date();
  const id = randomUUID();
  getDb().runSync(
    `INSERT INTO workouts (id, user_id, name, status, started_at, local_date, routine_id, client_updated_at)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
    id,
    userId,
    opts.name?.trim() || defaultWorkoutName(at),
    at.toISOString(),
    localDate(at),
    opts.routineId ?? null,
    at.toISOString(),
  );
  bump();
  return getWorkout(id)!;
}

export type AddExercise = { exercise: Exercise; targetSets?: number; targetReps?: number | null };

/**
 * Adds exercises to an open workout, each with empty set rows: the routine's target sets, else as many as
 * last session, else one. Rows start empty; the "Previous" column and placeholders show last session's
 * numbers, and ticking an empty row logs them (S24). Exercises already in the workout are skipped.
 * Returns the workout-exercise ids, in order (existing ids for skipped ones).
 */
export function addExercises(workout: Workout, items: readonly AddExercise[]): string[] {
  const db = getDb();
  const ids: string[] = [];
  db.withTransactionSync(() => {
    let position = Math.max(-1, ...workout.exercises.map((e) => e.position)) + 1;
    for (const { exercise, targetSets, targetReps } of items) {
      const existing = workout.exercises.find((e) => e.exerciseId === exercise.id);
      if (existing) {
        ids.push(existing.id);
        continue;
      }
      const weId = randomUUID();
      const previous = previousSets(workout.userId, exercise.id, workout.id).length;
      const rows = Math.min(10, targetSets ?? (previous || 1));
      db.runSync(
        `INSERT INTO workout_exercises (id, workout_id, exercise_id, position, name, type, category, target_reps)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        weId,
        workout.id,
        exercise.id,
        position++,
        exercise.name,
        exercise.type,
        exercise.category,
        targetReps ?? null,
      );
      for (let i = 0; i < rows; i++) insertSet(weId, i);
      ids.push(weId);
    }
  });
  bump();
  return ids;
}

function insertSet(workoutExerciseId: string, position: number, values: SetValues | null = null): string {
  const id = randomUUID();
  getDb().runSync(
    `INSERT INTO workout_sets (id, workout_exercise_id, position, weight_kg, reps, duration_s, distance_m)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    workoutExerciseId,
    position,
    values?.weightKg ?? null,
    values?.reps ?? null,
    values?.durationS ?? null,
    values?.distanceM ?? null,
  );
  return id;
}

/** A new empty row at the end of an exercise's set table ("+ Add set"). */
export function addSet(we: WorkoutExercise, values: SetValues | null = null): string {
  const id = insertSet(we.id, Math.max(-1, ...we.sets.map((s) => s.position)) + 1, values);
  bump();
  return id;
}

/** Saves typed numbers. Editing a ticked set re-checks the PRs of that exercise. */
export function updateSet(userId: string, we: WorkoutExercise, setId: string, values: SetValues): void {
  const v = valuesFor(we.type, values);
  getDb().runSync(
    `UPDATE workout_sets SET weight_kg = ?, reps = ?, duration_s = ?, distance_m = ? WHERE id = ?`,
    v.weightKg,
    v.reps,
    v.durationS,
    v.distanceM,
    setId,
  );
  if (we.sets.find((s) => s.id === setId)?.done) recomputePrs(userId, we.id);
  bump();
}

/**
 * Ticks a set with these values (✓). Returns the PR kinds it earned, or null when the values are
 * incomplete for the exercise type (the row stays unticked).
 */
export function completeSet(userId: string, we: WorkoutExercise, setId: string, values: SetValues): PrKind[] | null {
  const v = valuesFor(we.type, values);
  if (!isSetComplete(we.type, v)) return null;
  const db = getDb();
  let kinds: PrKind[] = [];
  db.withTransactionSync(() => {
    db.runSync(
      `UPDATE workout_sets SET weight_kg = ?, reps = ?, duration_s = ?, distance_m = ?, done = 1, completed_at = ?
       WHERE id = ?`,
      v.weightKg,
      v.reps,
      v.durationS,
      v.distanceM,
      new Date().toISOString(),
      setId,
    );
    kinds = recomputePrs(userId, we.id).get(setId) ?? [];
  });
  bump();
  return kinds;
}

/** Unticks a set (it keeps its numbers). */
export function uncompleteSet(userId: string, we: WorkoutExercise, setId: string): void {
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync(`UPDATE workout_sets SET done = 0, completed_at = NULL, pr_kinds = '[]' WHERE id = ?`, setId);
    recomputePrs(userId, we.id);
  });
  bump();
}

export function removeSet(userId: string, we: WorkoutExercise, setId: string): void {
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM workout_sets WHERE id = ?`, setId);
    recomputePrs(userId, we.id);
  });
  bump();
}

export function removeExercise(we: WorkoutExercise): void {
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM workout_sets WHERE workout_exercise_id = ?`, we.id);
    db.runSync(`DELETE FROM workout_exercises WHERE id = ?`, we.id);
  });
  bump();
}

/** Re-works out the PR kinds of every ticked set of one exercise in one workout (D39): each set is
 *  compared with the history before this workout plus the ticked sets above it. */
function recomputePrs(userId: string, workoutExerciseId: string): Map<string, PrKind[]> {
  const db = getDb();
  const we = db.getFirstSync<ExerciseRow>(`SELECT * FROM workout_exercises WHERE id = ?`, workoutExerciseId);
  const out = new Map<string, PrKind[]>();
  if (!we) return out;
  const sets = db
    .getAllSync<SetRow>(`SELECT * FROM workout_sets WHERE workout_exercise_id = ? ORDER BY position`, we.id)
    .map(toSet);
  const history = we.exercise_id ? historyBests(userId, we.exercise_id, we.type, we.workout_id) : NO_BESTS;
  prsForSequence(we.type, history, sets).forEach((kinds, i) => {
    const s = sets[i]!;
    out.set(s.id, kinds);
    db.runSync(`UPDATE workout_sets SET pr_kinds = ? WHERE id = ?`, JSON.stringify(kinds), s.id);
  });
  return out;
}

/** Throws away an open workout (never synced, so nothing to tell the server). */
export function discardWorkout(id: string): void {
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync(
      `DELETE FROM workout_sets WHERE workout_exercise_id IN (SELECT id FROM workout_exercises WHERE workout_id = ?)`,
      id,
    );
    db.runSync(`DELETE FROM workout_exercises WHERE workout_id = ?`, id);
    db.runSync(`DELETE FROM workouts WHERE id = ? AND status = 'active'`, id);
  });
  bump();
}

/** Ticked sets in the open workout, and how many rows are still unticked (S24 finish dialog). */
export function finishCheck(w: Workout): { done: number; unticked: number } {
  const all = w.exercises.flatMap((e) => e.sets);
  const done = all.filter((s) => s.done).length;
  return { done, unticked: all.length - done };
}

/**
 * Finishes the open workout: unticked sets and empty exercises are dropped, then it's saved as 'done' and
 * queued for sync. Returns null (and discards it) when nothing was ticked.
 */
export function finishWorkout(id: string, at = new Date()): Workout | null {
  const db = getDb();
  const now = at.toISOString();
  let empty = false;
  db.withTransactionSync(() => {
    db.runSync(
      `DELETE FROM workout_sets WHERE done = 0
         AND workout_exercise_id IN (SELECT id FROM workout_exercises WHERE workout_id = ?)`,
      id,
    );
    db.runSync(
      `DELETE FROM workout_exercises WHERE workout_id = ?
         AND id NOT IN (SELECT workout_exercise_id FROM workout_sets)`,
      id,
    );
    const left = db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM workout_exercises WHERE workout_id = ?`, id);
    if (!left?.n) {
      db.runSync(`DELETE FROM workouts WHERE id = ?`, id);
      empty = true;
      return;
    }
    db.runSync(
      `UPDATE workouts SET status = 'done', ended_at = ?, client_updated_at = ?, synced = 0 WHERE id = ?`,
      now,
      now,
      id,
    );
    const w = getWorkout(id)!;
    enqueue({
      op_id: randomUUID(),
      user_id: w.userId,
      entity: "workout",
      action: "upsert",
      record_id: w.id,
      payload: JSON.stringify(syncPayload(w)),
      client_updated_at: now,
    });
  });
  bump();
  if (empty) return null;
  notifyLocalWrite();
  return getWorkout(id);
}

/** What the server stores (backend/src/modules/workouts/workouts.schemas.ts). */
function syncPayload(w: Workout) {
  return {
    name: w.name,
    startedAt: w.startedAt,
    endedAt: w.endedAt,
    localDate: w.localDate,
    routineId: w.routineId,
    exercises: w.exercises.map((e) => ({
      id: e.id,
      exerciseId: e.exerciseId,
      name: e.name,
      type: e.type,
      sets: e.sets.map((s) => ({
        id: s.id,
        ...valuesFor(e.type, s),
        completedAt: s.completedAt,
        prKinds: s.prKinds,
      })),
    })),
  };
}

/** Deletes a finished workout (S25) and tells the server. */
export function deleteWorkout(w: Workout): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.withTransactionSync(() => {
    db.runSync(`UPDATE workouts SET deleted = 1, synced = 0, client_updated_at = ? WHERE id = ?`, now, w.id);
    enqueue({
      op_id: randomUUID(),
      user_id: w.userId,
      entity: "workout",
      action: "delete",
      record_id: w.id,
      payload: null,
      client_updated_at: now,
    });
  });
  bump();
  notifyLocalWrite();
}

// ── Pull ───────────────────────────────────────────────────────────────────────────────────────

/** A workout as GET /users/:id/changes sends it (backend WorkoutDto). */
type ServerWorkout = {
  name: string;
  startedAt: string;
  endedAt: string;
  localDate: string;
  routineId: string | null;
  clientUpdatedAt: string;
  exercises: {
    id: string;
    exerciseId: string | null;
    name: string;
    type: ExerciseType;
    sets: (SetValues & { id: string; completedAt: string | null; prKinds: PrKind[] })[];
  }[];
};

function deleteWorkoutRows(id: string) {
  const db = getDb();
  db.runSync(
    `DELETE FROM workout_sets WHERE workout_exercise_id IN (SELECT id FROM workout_exercises WHERE workout_id = ?)`,
    id,
  );
  db.runSync(`DELETE FROM workout_exercises WHERE workout_id = ?`, id);
}

onPulled("workout", {
  apply(userId, { id, deleted, data }) {
    const db = getDb();
    const local = db.getFirstSync<{ synced: number; client_updated_at: string }>(
      `SELECT synced, client_updated_at FROM workouts WHERE id = ?`,
      id,
    );
    if (local && !local.synced) return; // open, or finished and not pushed yet
    if (deleted) {
      deleteWorkoutRows(id);
      db.runSync(`DELETE FROM workouts WHERE id = ?`, id);
      return;
    }
    const w = data as ServerWorkout;
    if (local?.client_updated_at === w.clientUpdatedAt) return;
    // category / target_reps are local display snapshots: keep this phone's, else take the cached exercise's.
    const kept = new Map(
      db
        .getAllSync<{ id: string; category: ExerciseCategory | null; target_reps: number | null }>(
          `SELECT id, category, target_reps FROM workout_exercises WHERE workout_id = ?`,
          id,
        )
        .map((r) => [r.id, r]),
    );
    deleteWorkoutRows(id);
    db.runSync(
      `INSERT OR REPLACE INTO workouts
         (id, user_id, name, status, started_at, ended_at, local_date, routine_id, client_updated_at, deleted, synced)
       VALUES (?, ?, ?, 'done', ?, ?, ?, ?, ?, 0, 1)`,
      id,
      userId,
      w.name,
      w.startedAt,
      w.endedAt,
      w.localDate,
      w.routineId,
      w.clientUpdatedAt,
    );
    w.exercises.forEach((e, position) => {
      db.runSync(
        `INSERT INTO workout_exercises (id, workout_id, exercise_id, position, name, type, category, target_reps)
         VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, (SELECT json_extract(data, '$.category') FROM exercises WHERE id = ?3)), ?)`,
        e.id,
        id,
        e.exerciseId,
        position,
        e.name,
        e.type,
        kept.get(e.id)?.category ?? null,
        kept.get(e.id)?.target_reps ?? null,
      );
      e.sets.forEach((st, i) =>
        db.runSync(
          `INSERT INTO workout_sets
             (id, workout_exercise_id, position, weight_kg, reps, duration_s, distance_m, done, completed_at, pr_kinds)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          st.id,
          e.id,
          i,
          st.weightKg ?? null,
          st.reps ?? null,
          st.durationS ?? null,
          st.distanceM ?? null,
          st.completedAt,
          JSON.stringify(st.prKinds ?? []),
        ),
      );
    });
  },

  requeueMissing(userId, onServer) {
    const db = getDb();
    const missing = db
      .getAllSync<{ id: string }>(
        `SELECT id FROM workouts WHERE user_id = ? AND status = 'done' AND synced = 1 AND deleted = 0`,
        userId,
      )
      .filter((r) => !onServer.has(r.id));
    for (const { id } of missing) {
      const now = new Date().toISOString();
      db.withTransactionSync(() => {
        db.runSync(`UPDATE workouts SET synced = 0, client_updated_at = ? WHERE id = ?`, now, id);
        const w = getWorkout(id)!;
        enqueue({
          op_id: randomUUID(),
          user_id: userId,
          entity: "workout",
          action: "upsert",
          record_id: id,
          payload: JSON.stringify(syncPayload(w)),
          client_updated_at: now,
        });
      });
    }
    return missing.length;
  },

  changed: bump,
});

// ── History ────────────────────────────────────────────────────────────────────────────────────

type HistoryRow = SetRow & { workout_id: string; workout_name: string; started_at: string; exercise_id: string };

/** Every ticked set of an exercise in finished workouts, newest workout first. */
function exerciseHistoryRows(userId: string, exerciseId: string, excludeWorkoutId: string | null = null): HistoryRow[] {
  return getDb().getAllSync<HistoryRow>(
    `SELECT s.*, w.id AS workout_id, w.name AS workout_name, w.started_at AS started_at, we.exercise_id AS exercise_id
       FROM workout_sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
       JOIN workouts w ON w.id = we.workout_id
      WHERE w.user_id = ? AND w.status = 'done' AND w.deleted = 0 AND s.done = 1
        AND we.exercise_id = ? AND w.id != ?
      ORDER BY w.started_at DESC, s.position`,
    userId,
    exerciseId,
    excludeWorkoutId ?? "",
  );
}

/** Best values from finished workouts other than `excludeWorkoutId` (the PR baseline). */
export function historyBests(userId: string, exerciseId: string, type: ExerciseType, excludeWorkoutId: string | null) {
  return bestsOf(type, exerciseHistoryRows(userId, exerciseId, excludeWorkoutId).map(toSet));
}

/** Last session's ticked sets for an exercise, in order (the S24 "Previous" column). */
export function previousSets(userId: string, exerciseId: string | null, excludeWorkoutId: string | null): WorkoutSet[] {
  if (!exerciseId) return [];
  const rows = exerciseHistoryRows(userId, exerciseId, excludeWorkoutId);
  const last = rows[0]?.workout_id;
  return rows.filter((r) => r.workout_id === last).map(toSet);
}

export type ExerciseSession = { workoutId: string; workoutName: string; startedAt: string; sets: WorkoutSet[] };

/** Sessions of one exercise, newest first (S27). */
export function exerciseSessions(userId: string, exerciseId: string): ExerciseSession[] {
  const out: ExerciseSession[] = [];
  for (const r of exerciseHistoryRows(userId, exerciseId)) {
    let s = out[out.length - 1];
    if (!s || s.workoutId !== r.workout_id) {
      s = { workoutId: r.workout_id, workoutName: r.workout_name, startedAt: r.started_at, sets: [] };
      out.push(s);
    }
    s.sets.push(toSet(r));
  }
  return out;
}

export type ExerciseStat = { lastAt: string; lastTop: SetValues | null; bests: Bests };

/** Per exercise: when it was last done, that session's top set, and the bests (S23 rows). */
export function exerciseStats(userId: string, types: ReadonlyMap<string, ExerciseType>): Map<string, ExerciseStat> {
  const rows = getDb().getAllSync<HistoryRow>(
    `SELECT s.*, w.id AS workout_id, w.name AS workout_name, w.started_at AS started_at, we.exercise_id AS exercise_id
       FROM workout_sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
       JOIN workouts w ON w.id = we.workout_id
      WHERE w.user_id = ? AND w.status = 'done' AND w.deleted = 0 AND s.done = 1 AND we.exercise_id IS NOT NULL
      ORDER BY w.started_at DESC, s.position`,
    userId,
  );
  const grouped = new Map<string, HistoryRow[]>();
  for (const r of rows) grouped.set(r.exercise_id, [...(grouped.get(r.exercise_id) ?? []), r]);
  const out = new Map<string, ExerciseStat>();
  for (const [exerciseId, list] of grouped) {
    const type = types.get(exerciseId);
    if (!type) continue;
    const sets = list.map(toSet);
    const last = list[0]!.workout_id;
    out.set(exerciseId, {
      lastAt: list[0]!.started_at,
      lastTop: topSet(
        type,
        sets.filter((_, i) => list[i]!.workout_id === last),
      ),
      bests: bestsOf(type, sets),
    });
  }
  return out;
}

export function recentWorkouts(userId: string, limit = 10): Workout[] {
  return hydrate(
    getDb().getAllSync<WorkoutRow>(
      `SELECT * FROM workouts WHERE user_id = ? AND status = 'done' AND deleted = 0 ORDER BY started_at DESC LIMIT ?`,
      userId,
      limit,
    ),
  );
}

/** Finished workouts in [from, to] (local dates, inclusive). */
export function workoutsBetween(userId: string, from: string, to: string): Workout[] {
  return hydrate(
    getDb().getAllSync<WorkoutRow>(
      `SELECT * FROM workouts WHERE user_id = ? AND status = 'done' AND deleted = 0
         AND local_date >= ? AND local_date <= ? ORDER BY started_at`,
      userId,
      from,
      to,
    ),
  );
}

// ── Summaries ──────────────────────────────────────────────────────────────────────────────────

export type WorkoutStats = {
  durationS: number;
  volumeKg: number;
  sets: number;
  prs: { exerciseName: string; type: ExerciseType; set: WorkoutSet }[];
};

export function workoutStats(w: Workout, now = Date.now()): WorkoutStats {
  const end = w.endedAt ? new Date(w.endedAt).getTime() : now;
  let volumeKg = 0;
  let sets = 0;
  const prs: WorkoutStats["prs"] = [];
  for (const e of w.exercises) {
    for (const s of e.sets) {
      if (!s.done) continue;
      sets++;
      volumeKg += setVolume(e.type, s);
      if (s.prKinds.length) prs.push({ exerciseName: e.name, type: e.type, set: s });
    }
  }
  return { durationS: Math.max(0, Math.round((end - new Date(w.startedAt).getTime()) / 1000)), volumeKg, sets, prs };
}

// ── Hooks ──────────────────────────────────────────────────────────────────────────────────────

/** Re-reads on local writes and when sync status changes (synced ticks). */
export function useWorkoutsStamp() {
  const v = useWorkoutsVersion((s) => s.v);
  const sync = useSyncStatus((s) => `${s.pending}:${s.lastSyncedAt}`);
  return `${v}:${sync}`;
}

export function useActiveWorkout(userId: string | null): Workout | null {
  const stamp = useWorkoutsStamp();
  return useMemo(() => {
    void stamp;
    return userId ? activeWorkout(userId) : null;
  }, [userId, stamp]);
}

export function useWorkout(id: string | undefined): Workout | null {
  const stamp = useWorkoutsStamp();
  return useMemo(() => {
    void stamp;
    return id ? getWorkout(id) : null;
  }, [id, stamp]);
}

export function useRecentWorkouts(userId: string | null, limit = 10): Workout[] {
  const stamp = useWorkoutsStamp();
  return useMemo(() => {
    void stamp;
    return userId ? recentWorkouts(userId, limit) : [];
  }, [userId, limit, stamp]);
}

export function useExerciseSessions(userId: string | null, exerciseId: string | undefined): ExerciseSession[] {
  const stamp = useWorkoutsStamp();
  return useMemo(() => {
    void stamp;
    return userId && exerciseId ? exerciseSessions(userId, exerciseId) : [];
  }, [userId, exerciseId, stamp]);
}

export function useExerciseStats(userId: string | null, exercises: readonly Exercise[]): Map<string, ExerciseStat> {
  const stamp = useWorkoutsStamp();
  return useMemo(() => {
    void stamp;
    return userId ? exerciseStats(userId, new Map(exercises.map((e) => [e.id, e.type]))) : new Map();
  }, [userId, exercises, stamp]);
}

export function useWorkoutsBetween(userId: string | null, from: string, to: string): Workout[] {
  const stamp = useWorkoutsStamp();
  return useMemo(() => {
    void stamp;
    return userId ? workoutsBetween(userId, from, to) : [];
  }, [userId, from, to, stamp]);
}
