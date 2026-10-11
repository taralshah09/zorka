import type { RoutePoint } from "./activity.js";

export type MapCoordinate = [number, number];

/** GeoJSON uses longitude first. Never draw a bridge across a recording break. */
export function routeGeometry(points: readonly RoutePoint[]) {
  const lines: MapCoordinate[][] = [];
  let previous: RoutePoint | undefined;
  for (const p of points) {
    if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) {
      previous = undefined;
      continue;
    }
    if (
      !previous ||
      p.segment !== previous.segment ||
      p.timestamp - previous.timestamp > 30000
    )
      lines.push([]);
    lines.at(-1)!.push([p.longitude, p.latitude]);
    previous = p;
  }
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "MultiLineString" as const,
      coordinates: lines.filter((line) => line.length > 1),
    },
  };
}

/** Unwrap longitude around the first fix so a date-line crossing frames locally. */
export function routeBounds(
  points: readonly RoutePoint[],
): [number, number, number, number] | null {
  if (!points.length) return null;
  const origin = points[0]!.longitude;
  let west = Infinity,
    south = Infinity,
    east = -Infinity,
    north = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) continue;
    const lng =
      origin + ((((p.longitude - origin + 180) % 360) + 360) % 360) - 180;
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, p.latitude);
    north = Math.max(north, p.latitude);
  }
  return Number.isFinite(west)
    ? [west - 0.00015, south - 0.00015, east + 0.00015, north + 0.00015]
    : null;
}
