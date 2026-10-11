// P27 · Weigh-ins on the phone (S33 chart, S34 sheet). Local-first (D23), synced as entity "weight_log".
// The trend (EMA, D49) is computed from them on the fly by shared/domain/progress.ts, never stored.
import { randomUUID } from "expo-crypto";
import { useMemo } from "react";
import { create } from "zustand";

import type { Profile } from "@/core/api/types";
import { getDb } from "@/core/storage/db";
import { notifyLocalWrite, onAcknowledged, useSyncStatus } from "@/core/sync/engine";
import { enqueue } from "@/core/sync/outbox";
import { onPulled } from "@/core/sync/pull";
import { localDate } from "@shared/domain/food";
import { trendSeries, type TrendPoint, type WeighIn } from "@shared/domain/progress";

export type WeightLog = {
  id: string;
  userId: string;
  localDate: string;
  kg: number;
  loggedAt: string;
  synced: boolean;
};

/** Same bounds as the server (backend weights.schemas.ts). */
export const MIN_WEIGHT_KG = 20;
export const MAX_WEIGHT_KG = 400;

export const useWeightsVersion = create<{ v: number }>(() => ({ v: 0 }));
const bump = () => useWeightsVersion.setState((s) => ({ v: s.v + 1 }));

onAcknowledged("weight_log", (row) => {
  getDb().runSync(
    `UPDATE weight_logs SET synced = 1 WHERE id = ? AND client_updated_at = ?`,
    row.record_id,
    row.client_updated_at,
  );
});

type Row = { id: string; user_id: string; local_date: string; kg: number; logged_at: string; synced: number };

const toWeight = (r: Row): WeightLog => ({
  id: r.id,
  userId: r.user_id,
  localDate: r.local_date,
  kg: r.kg,
  loggedAt: r.logged_at,
  synced: !!r.synced,
});

/** Oldest first. */
export const listWeights = (userId: string): WeightLog[] =>
  getDb()
    .getAllSync<Row>(
      `SELECT * FROM weight_logs WHERE user_id = ? AND deleted = 0 ORDER BY local_date, logged_at`,
      userId,
    )
    .map(toWeight);

function write(w: Omit<WeightLog, "synced">, deleted: boolean) {
  const now = new Date().toISOString();
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT OR REPLACE INTO weight_logs (id, user_id, local_date, kg, logged_at, client_updated_at, deleted, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      w.id,
      w.userId,
      w.localDate,
      w.kg,
      w.loggedAt,
      now,
      deleted ? 1 : 0,
    );
    enqueue({
      op_id: randomUUID(),
      user_id: w.userId,
      entity: "weight_log",
      action: deleted ? "delete" : "upsert",
      record_id: w.id,
      payload: deleted ? null : JSON.stringify({ localDate: w.localDate, kg: w.kg, loggedAt: w.loggedAt }),
      client_updated_at: now,
    });
  });
  bump();
  notifyLocalWrite();
}

/** S34 Save. `day` defaults to today; the time is now either way. */
export function logWeight(userId: string, kg: number, day = localDate(new Date())): WeightLog {
  const w = {
    id: randomUUID(),
    userId,
    localDate: day,
    kg: Math.round(kg * 10) / 10,
    loggedAt: new Date().toISOString(),
  };
  write(w, false);
  return { ...w, synced: false };
}

export const deleteWeight = (w: WeightLog) => write(w, true);
export const restoreWeight = (w: WeightLog) => write(w, false);

// ── Pull ─────────────────────────────────────────────────────────────────────────────────────────

onPulled("weight_log", {
  apply(userId, { id, deleted, data }) {
    const db = getDb();
    const local = db.getFirstSync<{ synced: number; client_updated_at: string }>(
      `SELECT synced, client_updated_at FROM weight_logs WHERE id = ?`,
      id,
    );
    if (local && !local.synced) return; // an unsynced local edit wins until the outbox has pushed it
    if (deleted) {
      db.runSync(`DELETE FROM weight_logs WHERE id = ?`, id);
      return;
    }
    const w = data as { localDate: string; kg: number; loggedAt: string; clientUpdatedAt: string };
    if (local?.client_updated_at === w.clientUpdatedAt) return;
    db.runSync(
      `INSERT OR REPLACE INTO weight_logs (id, user_id, local_date, kg, logged_at, client_updated_at, deleted, synced)
       VALUES (?, ?, ?, ?, ?, ?, 0, 1)`,
      id,
      userId,
      w.localDate,
      w.kg,
      w.loggedAt,
      w.clientUpdatedAt,
    );
  },

  requeueMissing(userId, onServer) {
    const missing = listWeights(userId).filter((w) => w.synced && !onServer.has(w.id));
    for (const w of missing) write(w, false);
    return missing.length;
  },

  changed: bump,
});

// ── Trend ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Weigh-ins for the trend. The onboarding weight counts as the first weigh-in on the onboarding day when nothing
 * was logged on or before it, so the trend (and the first check-in) has a starting point.
 */
export function weighInsFor(weights: readonly WeightLog[], profile: Profile | null | undefined): WeighIn[] {
  const logged = weights.map((w) => ({ date: w.localDate, kg: w.kg }));
  if (!profile?.weightKg || !profile.onboardedAt) return logged;
  const start = localDate(new Date(profile.onboardedAt));
  return logged.some((w) => w.date <= start) ? logged : [{ date: start, kg: profile.weightKg }, ...logged];
}

/** Re-reads on local writes and when sync status changes. */
export function useWeightsStamp() {
  const v = useWeightsVersion((s) => s.v);
  const sync = useSyncStatus((s) => s.lastSyncedAt);
  return `${v}:${sync}`;
}

export function useWeights(userId: string | null): WeightLog[] {
  const stamp = useWeightsStamp();
  return useMemo(() => {
    void stamp;
    return userId ? listWeights(userId) : [];
  }, [userId, stamp]);
}

/** The user's weigh-ins and the trend through them. */
export function useTrend(userId: string | null, profile: Profile | null | undefined) {
  const weights = useWeights(userId);
  const series: TrendPoint[] = useMemo(() => trendSeries(weighInsFor(weights, profile)), [weights, profile]);
  return { weights, series, latest: series[series.length - 1] ?? null };
}
