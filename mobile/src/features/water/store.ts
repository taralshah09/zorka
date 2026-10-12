// Water on the phone. Local-first (D23): each tap on Today's glass writes one row ("water_log", one glass) together
// with an outbox op, so it works offline and syncs later. A day's glasses are the sum of its rows; undo deletes the
// latest one.
import { randomUUID } from "expo-crypto";
import { useMemo } from "react";
import { create } from "zustand";

import { getDb } from "@/core/storage/db";
import { notifyLocalWrite, onAcknowledged, useSyncStatus } from "@/core/sync/engine";
import { enqueue } from "@/core/sync/outbox";
import { onPulled } from "@/core/sync/pull";

export type WaterLog = {
  id: string;
  userId: string;
  localDate: string;
  glasses: number;
  loggedAt: string;
  synced: boolean;
};

export const useWaterVersion = create<{ v: number }>(() => ({ v: 0 }));
const bump = () => useWaterVersion.setState((s) => ({ v: s.v + 1 }));

onAcknowledged("water_log", (row) => {
  getDb().runSync(
    `UPDATE water_logs SET synced = 1 WHERE id = ? AND client_updated_at = ?`,
    row.record_id,
    row.client_updated_at,
  );
});

type Row = { id: string; user_id: string; local_date: string; glasses: number; logged_at: string; synced: number };

const toWater = (r: Row): WaterLog => ({
  id: r.id,
  userId: r.user_id,
  localDate: r.local_date,
  glasses: r.glasses,
  loggedAt: r.logged_at,
  synced: !!r.synced,
});

function write(w: Omit<WaterLog, "synced">, deleted: boolean) {
  const now = new Date().toISOString();
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT OR REPLACE INTO water_logs (id, user_id, local_date, glasses, logged_at, client_updated_at, deleted, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      w.id,
      w.userId,
      w.localDate,
      w.glasses,
      w.loggedAt,
      now,
      deleted ? 1 : 0,
    );
    enqueue({
      op_id: randomUUID(),
      user_id: w.userId,
      entity: "water_log",
      action: deleted ? "delete" : "upsert",
      record_id: w.id,
      payload: deleted ? null : JSON.stringify({ localDate: w.localDate, glasses: w.glasses, loggedAt: w.loggedAt }),
      client_updated_at: now,
    });
  });
  bump();
  notifyLocalWrite();
}

/** Glasses drunk on `day`. */
export function glassesOn(userId: string, day: string): number {
  return (
    getDb().getFirstSync<{ n: number | null }>(
      `SELECT SUM(glasses) AS n FROM water_logs WHERE user_id = ? AND local_date = ? AND deleted = 0`,
      userId,
      day,
    )?.n ?? 0
  );
}

/** Glasses per day from `start` to `end` (local dates, inclusive). Days without water are left out. */
export function glassesBetween(userId: string, start: string, end: string): Map<string, number> {
  const rows = getDb().getAllSync<{ date: string; n: number }>(
    `SELECT local_date AS date, SUM(glasses) AS n FROM water_logs
      WHERE user_id = ? AND local_date BETWEEN ? AND ? AND deleted = 0 GROUP BY local_date`,
    userId,
    start,
    end,
  );
  return new Map(rows.map((r) => [r.date, r.n]));
}

/** One glass on `day`, logged now. */
export function logGlass(userId: string, day: string): void {
  write({ id: randomUUID(), userId, localDate: day, glasses: 1, loggedAt: new Date().toISOString() }, false);
}

/** Removes the latest water log on `day`. False when there was nothing to remove. */
export function undoGlass(userId: string, day: string): boolean {
  const r = getDb().getFirstSync<Row>(
    `SELECT * FROM water_logs WHERE user_id = ? AND local_date = ? AND deleted = 0 ORDER BY logged_at DESC LIMIT 1`,
    userId,
    day,
  );
  if (!r) return false;
  write(toWater(r), true);
  return true;
}

// ── Pull ─────────────────────────────────────────────────────────────────────────────────────────

onPulled("water_log", {
  apply(userId, { id, deleted, data }) {
    const db = getDb();
    const local = db.getFirstSync<{ synced: number; client_updated_at: string }>(
      `SELECT synced, client_updated_at FROM water_logs WHERE id = ?`,
      id,
    );
    if (local && !local.synced) return; // an unsynced local edit wins until the outbox has pushed it
    if (deleted) {
      db.runSync(`DELETE FROM water_logs WHERE id = ?`, id);
      return;
    }
    const w = data as { localDate: string; glasses: number; loggedAt: string; clientUpdatedAt: string };
    if (local?.client_updated_at === w.clientUpdatedAt) return;
    db.runSync(
      `INSERT OR REPLACE INTO water_logs (id, user_id, local_date, glasses, logged_at, client_updated_at, deleted, synced)
       VALUES (?, ?, ?, ?, ?, ?, 0, 1)`,
      id,
      userId,
      w.localDate,
      w.glasses,
      w.loggedAt,
      w.clientUpdatedAt,
    );
  },

  requeueMissing(userId, onServer) {
    const missing = getDb()
      .getAllSync<Row>(`SELECT * FROM water_logs WHERE user_id = ? AND synced = 1 AND deleted = 0`, userId)
      .filter((r) => !onServer.has(r.id))
      .map(toWater);
    for (const w of missing) write(w, false);
    return missing.length;
  },

  changed: bump,
});

// ── Hooks ────────────────────────────────────────────────────────────────────────────────────────

/** Re-reads on local writes and when sync status changes. */
export function useWaterStamp() {
  const v = useWaterVersion((s) => s.v);
  const sync = useSyncStatus((s) => s.lastSyncedAt);
  return `${v}:${sync}`;
}

export function useGlasses(userId: string | null, day: string): number {
  const stamp = useWaterStamp();
  return useMemo(() => {
    void stamp;
    return userId ? glassesOn(userId, day) : 0;
  }, [userId, day, stamp]);
}
