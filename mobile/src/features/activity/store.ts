import { randomUUID } from "expo-crypto";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { create } from "zustand";

import { getDb } from "@/core/storage/db";
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
  const row = getDb().getFirstSync<{ data: string }>("SELECT data FROM activities WHERE id = ?", id);
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
