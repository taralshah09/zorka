import { create } from "zustand";
import { kv } from "@/core/storage/kv";
import type { IntakeCoverage } from "@shared/domain/evidence";

const key = (userId: string, day: string) => `zorka.coverage.${userId}.${day}`;
export const useCoverageVersion = create<{ v: number }>(() => ({ v: 0 }));
export function coverageFor(userId: string | null, day: string): IntakeCoverage {
  const value = userId ? kv.get(key(userId, day)) : null;
  return value === "complete" || value === "partial" ? value : "unknown";
}
export function setCoverage(userId: string, day: string, coverage: "complete" | "partial") {
  kv.set(key(userId, day), coverage);
  useCoverageVersion.setState((s) => ({ v: s.v + 1 }));
}
