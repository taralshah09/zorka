import { describe, expect, it } from "vitest";
import { routeBounds, routeGeometry } from "../../shared/domain/activityMap.js";
import type { RoutePoint } from "../../shared/domain/activity.js";

const fix = (
  longitude: number,
  timestamp: number,
  segment = 0,
): RoutePoint => ({
  longitude,
  latitude: 19,
  timestamp,
  segment,
  accuracy: 5,
  activeMs: timestamp,
});

describe("activity map geometry", () => {
  it("uses longitude/latitude coordinates and keeps pauses disconnected", () => {
    const points = [
      fix(72, 0),
      fix(72.001, 1000),
      fix(72.002, 2000, 1),
      fix(72.003, 3000, 1),
    ];
    expect(routeGeometry(points).geometry.coordinates).toEqual([
      [
        [72, 19],
        [72.001, 19],
      ],
      [
        [72.002, 19],
        [72.003, 19],
      ],
    ]);
  });
  it("does not draw a line across a long GPS outage", () => {
    expect(
      routeGeometry([
        fix(72, 0),
        fix(72.001, 1000),
        fix(73, 40000),
        fix(73.001, 41000),
      ]).geometry.coordinates,
    ).toHaveLength(2);
  });
  it("has no invalid one-coordinate lines for a single fix or empty route", () => {
    expect(routeGeometry([fix(72, 0)]).geometry.coordinates).toEqual([]);
    expect(routeBounds([])).toBeNull();
    const [west, south, east, north] = routeBounds([fix(72, 0)])!;
    expect(west).toBeLessThan(72);
    expect(east).toBeGreaterThan(72);
    expect(south).toBeLessThan(19);
    expect(north).toBeGreaterThan(19);
  });
  it("fits every recorded fix, including disconnected portions", () => {
    const [west, , east] = routeBounds([
      fix(72.1, 0),
      fix(72, 1000),
      fix(73, 2000, 1),
    ])!;
    expect(west).toBeLessThan(72);
    expect(east).toBeGreaterThan(73);
  });
  it("frames a date-line crossing locally instead of fitting the world", () => {
    const [west, , east] = routeBounds([fix(179.99, 0), fix(-179.99, 1000)])!;
    expect(east - west).toBeLessThan(0.03);
  });
  it("breaks at corrupt coordinates instead of connecting through them", () => {
    expect(
      routeGeometry([fix(72, 0), fix(NaN, 1000), fix(72.1, 2000)]).geometry
        .coordinates,
    ).toEqual([]);
  });
});
