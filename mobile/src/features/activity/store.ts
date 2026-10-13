import { randomUUID } from "expo-crypto";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { create } from "zustand";

import { getDb } from "@/core/storage/db";
import { notifyLocalWrite, onAcknowledged } from "@/core/sync/engine";
import { enqueue } from "@/core/sync/outbox";
import { onPulled } from "@/core/sync/pull";
import { localDate } from "@shared/domain/food";
import {
  activeMs,
  acceptFix,
  validFix,
  calories,
  movePoints,
  MET,
  type Activity,
  type ActivityKind,
  type RoutePoint,
} from "@shared/domain/activity";

const version = create<{ n: number }>(() => ({ n: 0 }));
export const activityChanged = () => version.setState((s) => ({ n: s.n + 1 }));
/** Changes whenever a local activity is written (P30 streak). */
export const useActivityVersion = () => version((s) => s.n);
export function useActivityClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const sub = AppState.addEventListener("change", () => {
      setNow(Date.now());
      activityChanged();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  version((s) => s.n);
  return now;
}
export function getActivity(id: string): Activity | null {
  const row = getDb().getFirstSync<{ data: string }>(
    "SELECT data FROM activities WHERE id = ? AND status != 'deleted'",
    id,
  );
  return row ? (JSON.parse(row.data) as Activity) : null;
}
export function activeActivity(): Activity | null {
  const row = getDb().getFirstSync<{ data: string }>(
    "SELECT data FROM activities WHERE status IN ('recording', 'paused') LIMIT 1",
  );
  return row ? (JSON.parse(row.data) as Activity) : null;
}
export function saveActivity(a: Activity) {
  getDb().runSync(
    "INSERT INTO activities(id,user_id,status,local_date,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, local_date=excluded.local_date, data=excluded.data",
    a.id,
    a.userId,
    a.status,
    a.localDate,
    JSON.stringify(a),
  );
  activityChanged();
}
export function createActivity(userId: string, kind: ActivityKind, weightKg: number, background: boolean): Activity {
  if (activeActivity()) throw new Error("Finish the activity already recording on this phone first.");
  if (!Number.isFinite(weightKg) || weightKg <= 0) throw new Error("Add your weight to your profile before recording.");
  const now = Date.now();
  const a: Activity = {
    id: randomUUID(),
    userId,
    kind,
    weightKg,
    startedAt: now,
    endedAt: null,
    localDate: localDate(new Date(now)),
    status: "paused",
    elapsedMs: 0,
    resumedAt: null,
    heartbeatAt: now,
    segment: 0,
    background,
    error: null,
    lastFixAt: null,
  };
  saveActivity(a);
  return a;
}
export function routePoints(id: string): RoutePoint[] {
  return getDb()
    .getAllSync<{ data: string }>("SELECT data FROM route_points WHERE activity_id = ? ORDER BY timestamp", id)
    .map((r) => JSON.parse(r.data) as RoutePoint);
}
export function appendFixes(id: string, fixes: Omit<RoutePoint, "segment" | "activeMs">[]) {
  const db = getDb();
  db.withTransactionSync(() => {
    const a = getActivity(id);
    if (!a || a.status !== "recording") return;
    const row = db.getFirstSync<{ data: string }>(
      "SELECT data FROM route_points WHERE activity_id = ? ORDER BY timestamp DESC LIMIT 1",
      id,
    );
    let last = row ? (JSON.parse(row.data) as RoutePoint) : null;
    for (const fix of [...fixes].sort((x, y) => x.timestamp - y.timestamp)) {
      // Delayed callbacks from before a resume must never be credited to the new segment.
      if (fix.timestamp < (a.resumedAt ?? 0) || !validFix(fix, Date.now())) continue;
      a.lastFixAt = Math.max(a.lastFixAt ?? 0, fix.timestamp);
      const p: RoutePoint = { ...fix, segment: a.segment, activeMs: activeMs(a, fix.timestamp) };
      const verdict = acceptFix(p, last, a.kind);
      if (verdict === "reject") continue;
      if (verdict === "gap" && last?.segment === a.segment) {
        a.segment++;
        p.segment = a.segment;
      }
      db.runSync(
        "INSERT OR IGNORE INTO route_points(activity_id,timestamp,data) VALUES(?,?,?)",
        id,
        p.timestamp,
        JSON.stringify(p),
      );
      last = p;
    }
    a.heartbeatAt = Date.now();
    a.error = null;
    saveActivity(a);
  });
}
export function setRecording(id: string, recording: boolean, now = Date.now()) {
  const a = getActivity(id);
  if (!a || a.status === "done") return;
  if (recording && a.status === "paused") {
    a.resumedAt = now;
    a.status = "recording";
    a.segment++;
    a.error = null;
    a.lastFixAt = null;
  } else if (!recording && a.status === "recording") {
    a.elapsedMs = activeMs(a, now);
    a.resumedAt = null;
    a.status = "paused";
  }
  a.heartbeatAt = now;
  saveActivity(a);
}
export function finishActivity(id: string) {
  const a = getActivity(id);
  if (!a || a.status === "done") return;
  a.elapsedMs = activeMs(a);
  a.resumedAt = null;
  a.status = "done";
  a.endedAt = Date.now();
  // Credit the completion day, including runs that cross midnight. Idempotent: one session row.
  a.localDate = localDate(new Date(a.endedAt));
  saveActivity(a);
  queueActivity(a);
}
/** Finished runs, walks and rides, newest first (Train → Recent). */
export function recentActivities(userId: string | null, limit: number): Activity[] {
  if (!userId) return [];
  return getDb()
    .getAllSync<{ data: string }>(
      "SELECT data FROM activities WHERE user_id = ? AND status = 'done' ORDER BY json_extract(data, '$.startedAt') DESC LIMIT ?",
      userId,
      limit,
    )
    .map((r) => JSON.parse(r.data) as Activity);
}
export function dayActivities(userId: string | null, day: string): Activity[] {
  if (!userId) return [];
  return getDb()
    .getAllSync<{ data: string }>(
      "SELECT data FROM activities WHERE user_id = ? AND local_date = ? AND status = 'done'",
      userId,
      day,
    )
    .map((r) => JSON.parse(r.data) as Activity);
}
export function dayCredit(userId: string | null, day: string) {
  const sessions = dayActivities(userId, day);
  return {
    sessions,
    kcal: sessions.reduce((s, a) => s + Math.round(calories(MET[a.kind], a.weightKg, a.elapsedMs / 1000)), 0),
    points: sessions.reduce((s, a) => s + Math.floor(movePoints(MET[a.kind], a.elapsedMs / 1000)), 0),
  };
}

// ── Sync (entity "activity") ─────────────────────────────────────────────────────────────────────
// Finished sessions go to the server with their route, so they survive a new phone or a reinstall.

onAcknowledged("activity", (row) => {
  getDb().runSync(
    `UPDATE activities SET synced = 1 WHERE id = ? AND client_updated_at = ?`,
    row.record_id,
    row.client_updated_at,
  );
});

/**
 * Deletes a finished activity (UX F5). The row stays as status 'deleted' (out of every list, the budget and the
 * streak) so a pull can't bring it back before the server has the delete; the pulled tombstone removes it.
 */
export function deleteActivity(a: Activity) {
  const db = getDb();
  const now = new Date().toISOString();
  db.withTransactionSync(() => {
    db.runSync(
      `UPDATE activities SET status = 'deleted', synced = 0, client_updated_at = ? WHERE id = ? AND status = 'done'`,
      now,
      a.id,
    );
    enqueue({
      op_id: randomUUID(),
      user_id: a.userId,
      entity: "activity",
      action: "delete",
      record_id: a.id,
      payload: null,
      client_updated_at: now,
    });
  });
  activityChanged();
  notifyLocalWrite();
}

/** Undo for a just-deleted activity: back to done, sent again with a newer write (it wins over the delete). */
export function restoreActivity(a: Activity) {
  getDb().runSync(`UPDATE activities SET status = 'done' WHERE id = ? AND status = 'deleted'`, a.id);
  queueActivity(a);
  activityChanged();
}

/** The server's cap (backend activities.schemas.ts); longer routes are thinned evenly. */
const MAX_POINTS = 50_000;

/** What the server stores. Points travel as [lat, lng, timestamp, accuracy, segment, activeMs]. */
function syncPayload(a: Activity) {
  let points = routePoints(a.id);
  if (points.length > MAX_POINTS) {
    const step = Math.ceil(points.length / MAX_POINTS);
    points = points.filter((_, i) => i % step === 0);
  }
  return {
    kind: a.kind,
    weightKg: a.weightKg,
    startedAt: new Date(a.startedAt).toISOString(),
    endedAt: new Date(Math.max(a.endedAt ?? a.startedAt, a.startedAt)).toISOString(),
    localDate: a.localDate,
    elapsedMs: Math.round(a.elapsedMs),
    points: points.map((p) => [
      p.latitude,
      p.longitude,
      Math.round(p.timestamp),
      Math.max(0, p.accuracy ?? 0),
      p.segment,
      Math.round(p.activeMs),
    ]),
  };
}

/** Marks a finished activity unsynced and queues it for the server. */
function queueActivity(a: Activity) {
  const db = getDb();
  const now = new Date().toISOString();
  db.withTransactionSync(() => {
    db.runSync(`UPDATE activities SET synced = 0, client_updated_at = ? WHERE id = ?`, now, a.id);
    enqueue({
      op_id: randomUUID(),
      user_id: a.userId,
      entity: "activity",
      action: "upsert",
      record_id: a.id,
      payload: JSON.stringify(syncPayload(a)),
      client_updated_at: now,
    });
  });
  notifyLocalWrite();
}

/** An activity as GET /users/:id/changes sends it (backend ActivityDto). */
type ServerActivity = {
  kind: ActivityKind;
  weightKg: number;
  startedAt: string;
  endedAt: string;
  localDate: string;
  elapsedMs: number;
  points: [number, number, number, number, number, number][];
  clientUpdatedAt: string;
};

onPulled("activity", {
  apply(userId, { id, deleted, data }) {
    const db = getDb();
    const local = db.getFirstSync<{ synced: number; client_updated_at: string | null }>(
      `SELECT synced, client_updated_at FROM activities WHERE id = ?`,
      id,
    );
    if (local && !local.synced) return; // recording, or finished and not pushed yet
    if (deleted) {
      db.runSync(`DELETE FROM route_points WHERE activity_id = ?`, id);
      db.runSync(`DELETE FROM activities WHERE id = ?`, id);
      return;
    }
    const s = data as ServerActivity;
    if (local?.client_updated_at === s.clientUpdatedAt) return;
    const endedAt = Date.parse(s.endedAt);
    const last = s.points.at(-1);
    const a: Activity = {
      id,
      userId,
      kind: s.kind,
      weightKg: s.weightKg,
      startedAt: Date.parse(s.startedAt),
      endedAt,
      localDate: s.localDate,
      status: "done",
      elapsedMs: s.elapsedMs,
      resumedAt: null,
      heartbeatAt: endedAt,
      lastFixAt: last ? last[2] : null,
      segment: last ? last[4] : 0,
      background: false,
      error: null,
    };
    db.runSync(
      `INSERT OR REPLACE INTO activities (id, user_id, status, local_date, data, client_updated_at, synced)
       VALUES (?, ?, 'done', ?, ?, ?, 1)`,
      id,
      userId,
      a.localDate,
      JSON.stringify(a),
      s.clientUpdatedAt,
    );
    db.runSync(`DELETE FROM route_points WHERE activity_id = ?`, id);
    for (const [latitude, longitude, timestamp, accuracy, segment, activeMs] of s.points) {
      const p: RoutePoint = { latitude, longitude, timestamp, accuracy, segment, activeMs };
      db.runSync(
        `INSERT OR IGNORE INTO route_points (activity_id, timestamp, data) VALUES (?, ?, ?)`,
        id,
        timestamp,
        JSON.stringify(p),
      );
    }
  },

  // Also catches sessions finished before activities synced: unsynced and with no op in the outbox.
  requeueMissing(userId, onServer) {
    const missing = getDb()
      .getAllSync<{ id: string; synced: number }>(
        `SELECT id, synced FROM activities
         WHERE user_id = ? AND status = 'done'
           AND (synced = 1 OR id NOT IN (SELECT record_id FROM outbox WHERE entity = 'activity'))`,
        userId,
      )
      .filter((r) => !r.synced || !onServer.has(r.id));
    for (const { id } of missing) {
      const a = getActivity(id);
      if (a) queueActivity(a);
    }
    return missing.length;
  },

  changed: activityChanged,
});
