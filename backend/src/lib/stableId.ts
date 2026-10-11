// Stable UUIDs (v5 layout) for seeded rows, so re-seeding never changes ids the phone has cached.
import { createHash } from "node:crypto";

export function stableUuid(key: string): string {
  const h = createHash("sha1").update(key).digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
