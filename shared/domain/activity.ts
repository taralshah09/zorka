// P23–P26: pure recorder maths. MET presets are estimates, not measured heart rate.
export type ActivityKind = "run" | "walk" | "ride";
export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  run: "Run",
  walk: "Walk",
  ride: "Ride",
};
export const MET: Record<ActivityKind, number> = {
  run: 8.3,
  walk: 3.8,
  ride: 6.8,
};
export const MOVE_GOAL = 30;
export type RoutePoint = {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number;
  segment: number;
  activeMs: number;
};
export type Activity = {
  id: string;
  userId: string;
  kind: ActivityKind;
  weightKg: number;
  startedAt: number;
  endedAt: number | null;
  localDate: string;
  status: "recording" | "paused" | "done";
  elapsedMs: number;
  resumedAt: number | null;
  heartbeatAt: number;
  lastFixAt: number | null;
  segment: number;
  background: boolean;
  error: string | null;
};

export function activeMs(a: Activity, now = Date.now()): number {
  return (
    a.elapsedMs +
    (a.status === "recording" && a.resumedAt !== null
      ? Math.max(0, now - a.resumedAt)
      : 0)
  );
}
export function movePoints(met: number, seconds: number): number {
  if (!Number.isFinite(met) || !Number.isFinite(seconds) || seconds <= 0)
    return 0;
  return (seconds / 60) * (met >= 6 ? 2 : met >= 3 ? 1 : 0);
}
export function calories(
  met: number,
  weightKg: number,
  seconds: number,
): number {
  if (
    ![met, weightKg, seconds].every(Number.isFinite) ||
    met <= 0 ||
    weightKg <= 0 ||
    seconds <= 0
  )
    return 0;
  return (met * weightKg * seconds) / 3600;
}
export function distance(
  a: Pick<RoutePoint, "latitude" | "longitude">,
  b: Pick<RoutePoint, "latitude" | "longitude">,
): number {
  const rad = Math.PI / 180;
  const x =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, x)));
}
export function validFix(
  p: Pick<RoutePoint, "latitude" | "longitude" | "accuracy" | "timestamp">,
  now: number,
): boolean {
  return (
    [p.latitude, p.longitude, p.accuracy, p.timestamp].every(Number.isFinite) &&
    Math.abs(p.latitude) <= 90 &&
    Math.abs(p.longitude) <= 180 &&
    p.accuracy >= 0 &&
    p.accuracy <= 35 &&
    p.timestamp <= now + 2000 &&
    p.timestamp >= now - 120000
  );
}
// The first fix after a pause or signal gap is an anchor, never a bridge across the gap.
export function acceptFix(
  p: RoutePoint,
  last: RoutePoint | null,
  kind: ActivityKind,
): "accept" | "gap" | "reject" {
  if (!last) return "accept";
  if (p.timestamp <= last.timestamp) return "reject";
  if (p.segment !== last.segment || p.timestamp - last.timestamp > 30000)
    return "gap";
  const metres = distance(last, p);
  const speed = metres / ((p.timestamp - last.timestamp) / 1000);
  if (speed > { run: 10, walk: 4, ride: 25 }[kind]) return "reject";
  return metres < Math.max(3, Math.min(last.accuracy, p.accuracy) / 3)
    ? "reject"
    : "accept";
}
export type Split = {
  km: number;
  distanceM: number;
  seconds: number;
  complete: boolean;
};
export function routeStats(points: readonly RoutePoint[]) {
  let distanceM = 0;
  let splitStartMs = 0;
  let lastCrossingM = 0;
  const splits: Split[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (a.segment !== b.segment) continue;
    const edge = distance(a, b);
    if (edge <= 0) continue;
    const end = distanceM + edge;
    while ((splits.length + 1) * 1000 <= end + 0.000001) {
      const crossing = (splits.length + 1) * 1000;
      const crossingMs =
        a.activeMs +
        (b.activeMs - a.activeMs) * Math.min(1, (crossing - distanceM) / edge);
      splits.push({
        km: splits.length + 1,
        distanceM: 1000,
        seconds: Math.max(0, crossingMs - splitStartMs) / 1000,
        complete: true,
      });
      splitStartMs = crossingMs;
      lastCrossingM = crossing;
    }
    distanceM = end;
  }
  if (distanceM - lastCrossingM > 1)
    splits.push({
      km: splits.length + 1,
      distanceM: distanceM - lastCrossingM,
      seconds:
        Math.max(0, (points.at(-1)?.activeMs ?? 0) - splitStartMs) / 1000,
      complete: false,
    });
  return { distanceM, splits };
}
export function paceLabel(seconds: number, metres: number): string {
  if (metres < 10 || seconds <= 0) return "—";
  const s = Math.round(seconds / (metres / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} /km`;
}
export function clockLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ""}${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
