/** Coverage describes the record, never the person's health or effort. Legacy records are unknown. */
export type IntakeCoverage = "unknown" | "partial" | "complete" | "pending";
export type Freshness = "current" | "stale" | "unknown";
export function freshness(at: string | null | undefined, now: number, maxAgeMs: number): Freshness {
  if (!at || !Number.isFinite(Date.parse(at))) return "unknown";
  const age = now - Date.parse(at);
  return age >= 0 && age <= maxAgeMs ? "current" : "stale";
}
export function coverageText(coverage: IntakeCoverage, meals: number): string {
  if (coverage === "pending") return "Capture saved on this phone. Estimate pending.";
  if (coverage === "complete") return "You confirmed these records are reasonably complete. Nutrition remains an estimate.";
  return `${meals} ${meals === 1 ? "meal" : "meals"} recorded. These totals may be incomplete.`;
}
