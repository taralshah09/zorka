import { describe, expect, it } from "vitest";
import {
  acceptFix,
  activeMs,
  calories,
  clockLabel,
  distance,
  MET,
  movePoints,
  paceLabel,
  routeStats,
  validFix,
  type Activity,
  type RoutePoint,
} from "../../shared/domain/activity.js";

const fix = (metres: number, seconds: number, segment = 1): RoutePoint => ({
  latitude: 0,
  longitude: ((metres / 6371000) * 180) / Math.PI,
  timestamp: 1000000 + seconds * 1000,
  activeMs: seconds * 1000,
  accuracy: 5,
  segment,
});
const session: Activity = {
  id: "run",
  userId: "u",
  kind: "run",
  weightKg: 70,
  startedAt: 0,
  endedAt: null,
  localDate: "2026-10-11",
  status: "recording",
  elapsedMs: 60000,
  resumedAt: 120000,
  heartbeatAt: 120000,
  segment: 1,
  background: true,
  error: null,
  lastFixAt: null,
};

describe("activity points and calories", () => {
  it("uses moderate/vigorous boundaries and fractional minutes", () => {
    expect(movePoints(2.9, 1200)).toBe(0);
    expect(movePoints(3, 1200)).toBe(20);
    expect(movePoints(5.9, 1200)).toBe(20);
    expect(movePoints(6, 1200)).toBe(40);
    expect(movePoints(MET.run, 90)).toBe(3);
  });
  it("calculates MET × weight × hours, with no invented weight", () => {
    expect(calories(8.3, 70, 1800)).toBeCloseTo(290.5);
    expect(calories(8.3, 0, 1800)).toBe(0);
    expect(calories(8.3, NaN, 1800)).toBe(0);
  });
  it("rejects invalid duration and intensity", () => {
    expect(movePoints(6, -1)).toBe(0);
    expect(movePoints(NaN, 60)).toBe(0);
    expect(calories(Infinity, 70, 60)).toBe(0);
    expect(calories(6, 70, -1)).toBe(0);
  });
  it("counts active time through pause/resume but not paused time", () => {
    expect(activeMs(session, 180000)).toBe(120000);
    expect(
      activeMs({ ...session, status: "paused", resumedAt: null }, 10000000),
    ).toBe(60000);
    expect(
      activeMs({ ...session, status: "done", resumedAt: null }, 10000000),
    ).toBe(60000);
    expect(activeMs(session, 0)).toBe(60000);
  });
});
describe("GPS filtering", () => {
  it("calculates geodesic distance", () =>
    expect(distance(fix(0, 0), fix(5000, 1500))).toBeCloseTo(5000, 3));
  it("accepts a normal outdoor fix", () =>
    expect(validFix(fix(10, 3), 1003000)).toBe(true));
  it.each([
    { accuracy: 80 },
    { accuracy: -1 },
    { latitude: 91 },
    { longitude: 181 },
    { timestamp: NaN },
    { timestamp: 0 },
    { timestamp: 2000000 },
  ])("rejects inaccurate/stale/invalid fixes %j", (patch) => {
    expect(validFix({ ...fix(0, 0), ...patch }, 1000000)).toBe(false);
  });
  it("rejects out-of-order duplicates and stationary drift", () => {
    expect(acceptFix(fix(5, 0), fix(0, 0), "run")).toBe("reject");
    expect(acceptFix(fix(1, 3), fix(0, 0), "run")).toBe("reject");
  });
  it("rejects impossible jumps using activity-specific speed limits", () => {
    expect(acceptFix(fix(1000, 3), fix(0, 0), "ride")).toBe("reject");
    expect(acceptFix(fix(20, 3), fix(0, 0), "walk")).toBe("reject");
    expect(acceptFix(fix(20, 3), fix(0, 0), "run")).toBe("accept");
  });
  it("starts a new segment after a pause or 30-second GPS gap", () => {
    expect(acceptFix(fix(200, 60), fix(0, 0), "run")).toBe("gap");
    expect(acceptFix(fix(100, 3, 2), fix(0, 0), "run")).toBe("gap");
  });
});
describe("route splits", () => {
  it("a synthetic 5 km run has five 5-minute splits", () => {
    const route = Array.from({ length: 501 }, (_, i) => fix(i * 10, i * 3));
    const stats = routeStats(route);
    expect(stats.distanceM).toBeCloseTo(5000, 3);
    const full = stats.splits.filter((s) => s.complete);
    expect(stats.splits).toHaveLength(5);
    expect(full).toHaveLength(5);
    stats.splits.forEach((s) => expect(s.seconds).toBeCloseTo(300, 3));
    expect(paceLabel(1500, stats.distanceM)).toBe("5:00 /km");
  });
  it("interpolates crossings and reports the final partial km", () => {
    const stats = routeStats([fix(0, 0), fix(800, 240), fix(1600, 480)]);
    expect(stats.splits[0]!.seconds).toBeCloseTo(300);
    expect(stats.splits[1]!.distanceM).toBeCloseTo(600);
    expect(stats.splits[1]!.seconds).toBeCloseTo(180);
    expect(stats.splits[1]!.complete).toBe(false);
  });
  it("doesn't add distance across a paused segment or GPS gap", () => {
    const stats = routeStats([
      fix(0, 0),
      fix(500, 150),
      fix(2000, 150, 2),
      fix(2500, 300, 2),
    ]);
    expect(stats.distanceM).toBeCloseTo(1000);
    expect(stats.splits[0]!.seconds).toBeCloseTo(300);
  });
  it("handles no route, one point and zero distance", () => {
    expect(routeStats([])).toEqual({ distanceM: 0, splits: [] });
    expect(routeStats([fix(0, 0)]).splits).toEqual([]);
    expect(routeStats([fix(0, 0), fix(0, 3)]).distanceM).toBe(0);
    expect(paceLabel(60, 0)).toBe("—");
  });
  it("formats elapsed time with hours", () => {
    expect(clockLabel(3661)).toBe("1:01:01");
    expect(clockLabel(61)).toBe("01:01");
  });
});
