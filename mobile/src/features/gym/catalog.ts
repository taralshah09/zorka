// Exercise list on the phone (P19). The server's list (curated + the user's own exercises) is cached in
// SQLite so the picker works offline. User-created exercises are written here first and synced as entity
// "custom_exercise" (D23). Same shape as the food catalog (features/food/catalog.ts).
import { randomUUID } from "expo-crypto";
import { useEffect, useMemo } from "react";
import { create } from "zustand";

import { api, describeError } from "@/core/api/client";
import type { Exercise } from "@/core/api/types";
import { useNetwork } from "@/core/network/network";
import { getDb } from "@/core/storage/db";
import { kv } from "@/core/storage/kv";
import { notifyLocalWrite, onAcknowledged } from "@/core/sync/engine";
import { enqueue } from "@/core/sync/outbox";
import { useActiveUser } from "@/features/users/activeUser";
import { rankFoods } from "@shared/domain/foodMatch";
import { cleanMusclewikiUrl, type ExerciseCategory, type ExerciseType } from "@shared/domain/gym";

/** Bumped whenever the local list changes, so hooks re-read it. */
export const useExercisesVersion = create<{ v: number }>(() => ({ v: 0 }));

export const useExerciseCatalogStatus = create<{ loading: boolean; error: { title: string; body: string } | null }>(
  () => ({ loading: false, error: null }),
);

let cache: { userId: string; list: Exercise[]; byId: Map<string, Exercise> } | null = null;

function invalidate() {
  cache = null;
  useExercisesVersion.setState((s) => ({ v: s.v + 1 }));
}

onAcknowledged("custom_exercise", (row) => {
  getDb().runSync(`UPDATE exercises SET synced = 1 WHERE id = ?`, row.record_id);
});

function load(userId: string) {
  if (cache?.userId === userId) return cache;
  const rows = getDb().getAllSync<{ data: string }>(
    `SELECT data FROM exercises WHERE deleted = 0 AND (owner_user_id IS NULL OR owner_user_id = ?) ORDER BY name`,
    userId,
  );
  const list = rows.map((r) => JSON.parse(r.data) as Exercise);
  cache = { userId, list, byId: new Map(list.map((e) => [e.id, e])) };
  return cache;
}

export const localExercises = (userId: string): Exercise[] => load(userId).list;
export const getExercise = (userId: string, id: string | null | undefined): Exercise | null =>
  id ? (load(userId).byId.get(id) ?? null) : null;

/** Ranked, offline search with the shared matcher (names + aliases like "ohp", "rdl"). */
export function searchExercises(userId: string, q: string, limit = 40): Exercise[] {
  return q.trim() ? rankFoods(q, localExercises(userId), 0.35, limit) : localExercises(userId);
}

const syncedAtKey = (userId: string) => `zorka.exercisesSyncedAt.${userId}`;
const REFRESH_EVERY_MS = 6 * 60 * 60 * 1000;

/** Pulls the list from the server. Keeps user-created exercises that haven't synced yet. */
export async function refreshExerciseCatalog(userId: string, force = false): Promise<void> {
  const last = Number(kv.get(syncedAtKey(userId)) ?? 0);
  const haveCurated = !!getDb().getFirstSync(`SELECT 1 FROM exercises WHERE owner_user_id IS NULL LIMIT 1`);
  if (!force && haveCurated && Date.now() - last < REFRESH_EVERY_MS) return;

  useExerciseCatalogStatus.setState({ loading: true, error: null });
  let exercises: Exercise[];
  try {
    ({ exercises } = await api<{ exercises: Exercise[] }>(`/users/${userId}/exercises/catalog`, { timeoutMs: 20_000 }));
  } catch (err) {
    useExerciseCatalogStatus.setState({ loading: false, error: describeError(err) });
    throw err;
  }
  useExerciseCatalogStatus.setState({ loading: false, error: null });
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM exercises WHERE owner_user_id IS NULL`);
    db.runSync(`DELETE FROM exercises WHERE owner_user_id = ? AND synced = 1`, userId);
    for (const e of exercises) {
      db.runSync(
        `INSERT OR IGNORE INTO exercises (id, owner_user_id, name, data, synced) VALUES (?, ?, ?, ?, 1)`,
        e.id,
        e.custom ? userId : null,
        e.name,
        JSON.stringify(e),
      );
    }
  });
  kv.set(syncedAtKey(userId), String(Date.now()));
  invalidate();
}

/** Keeps the active user's list fresh: on start, on user switch and when the phone comes online. */
export function useExerciseCatalogSync() {
  const userId = useActiveUser((s) => s.userId);
  const online = useNetwork((s) => s.online);
  useEffect(() => {
    if (userId && online) refreshExerciseCatalog(userId).catch(() => {});
  }, [userId, online]);
}

export function useExercises(userId: string | null): Exercise[] {
  const v = useExercisesVersion((s) => s.v);
  return useMemo(() => {
    void v;
    return userId ? localExercises(userId) : [];
  }, [userId, v]);
}

export function useExercise(userId: string | null, id: string | undefined): Exercise | null {
  const v = useExercisesVersion((s) => s.v);
  return useMemo(() => {
    void v;
    return userId && id ? getExercise(userId, id) : null;
  }, [userId, id, v]);
}

// ── Create / edit / delete your own exercise ───────────────────────────────────────────────────

export type NewExercise = {
  name: string;
  category: ExerciseCategory;
  type: ExerciseType;
  /** Optional MuscleWiki link; anything else is refused (D38). */
  referenceUrl: string | null;
};

/** Saves (creates, or updates when `id` is given) a user-created exercise and queues it for sync. */
export function saveExercise(userId: string, input: NewExercise, id: string = randomUUID()): Exercise {
  const now = new Date().toISOString();
  const exercise: Exercise = {
    id,
    name: input.name.trim(),
    aliases: [],
    category: input.category,
    type: input.type,
    referenceUrl: input.referenceUrl ? cleanMusclewikiUrl(input.referenceUrl) : null,
    source: "user",
    custom: true,
    updatedAt: now,
  };
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT OR REPLACE INTO exercises (id, owner_user_id, name, data, deleted, synced) VALUES (?, ?, ?, ?, 0, 0)`,
      id,
      userId,
      exercise.name,
      JSON.stringify(exercise),
    );
    enqueue({
      op_id: randomUUID(),
      user_id: userId,
      entity: "custom_exercise",
      action: "upsert",
      record_id: id,
      payload: JSON.stringify({
        name: exercise.name,
        category: exercise.category,
        type: exercise.type,
        referenceUrl: exercise.referenceUrl,
      }),
      client_updated_at: now,
    });
  });
  invalidate();
  notifyLocalWrite();
  return exercise;
}

/** Hides a user-created exercise. Past workouts keep their name snapshot. */
export function deleteExercise(userId: string, exercise: Exercise): void {
  if (!exercise.custom) return;
  const now = new Date().toISOString();
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync(`UPDATE exercises SET deleted = 1, synced = 0 WHERE id = ?`, exercise.id);
    enqueue({
      op_id: randomUUID(),
      user_id: userId,
      entity: "custom_exercise",
      action: "delete",
      record_id: exercise.id,
      payload: null,
      client_updated_at: now,
    });
  });
  invalidate();
  notifyLocalWrite();
}
