// P38 · A route as an SVG path that fills a box, north up, keeping its aspect ratio. Same projection as RouteSketch
// (S30): longitude scaled by cos(latitude), and a pause or a GPS gap over 30 s starts a new stroke.
import type { RoutePoint } from "@shared/domain/activity";

type XY = { x: number; y: number };

export function routePath(
  points: readonly RoutePoint[],
  width: number,
  height: number,
  pad: number,
): { d: string; start: XY; end: XY } | null {
  if (points.length < 2) return null;
  const midLat = points.reduce((s, p) => s + p.latitude, 0) / points.length;
  const cos = Math.cos((midLat * Math.PI) / 180);
  const raw = points.map((p) => ({ x: p.longitude * cos, y: -p.latitude }));
  const xs = raw.map((p) => p.x);
  const ys = raw.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  const xy = raw.map((p) => ({ x: offX + (p.x - minX) * scale, y: offY + (p.y - minY) * scale }));

  const d = xy
    .map((p, i) => {
      const prev = points[i - 1];
      const cur = points[i]!;
      const jump = !prev || cur.segment !== prev.segment || cur.timestamp - prev.timestamp > 30_000;
      return `${jump ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(" ");
  return { d, start: xy[0]!, end: xy[xy.length - 1]! };
}
