// LA5/LA6 · Memory facts on the phone ("memory_fact", D78): what Zorka has learned (inferred once a day from the last
// 28 days), what the user confirmed in chat ("Remember this?"), and their status. One live row per key. Only active
// facts feed the planner and the coach; "What Zorka knows" shows suggested ones to confirm or dismiss.
import { useMemo } from "react";

import { kv } from "@/core/storage/kv";
import { mealsBetween } from "@/features/meals/store";
import { coverageFor } from "@/features/meals/coverage";
import { workoutsBetween } from "@/features/gym/store";
import { glassesBetween } from "@/features/water/store";
import {
  activeFacts,
  aliasesFrom,
  aliasFact,
  FACT_KEYS,
  inferFacts,
  mergeFacts,
  MEMORY_WINDOW_DAYS,
  noteKey,
  type ActiveFacts,
  type AliasValue,
  type FactStatus,
  type LoggedDay,
  type MemoryFact,
} from "@shared/domain/memory";
import { addDays, datesBetween } from "@shared/domain/progress";
import { localEntity, newId } from "./local";

const obj = (raw: unknown): Record<string, unknown> => {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/** The whole fact is one JSON column plus the key and status columns used to look it up. */
const toFact = (id: string, d: Record<string, unknown>): MemoryFact => ({
  id,
  key: String(d.key),
  kind: (d.kind as MemoryFact["kind"]) ?? "pattern",
  value: d.value ?? null,
  text: String(d.text ?? ""),
  source: (d.source as MemoryFact["source"]) ?? "inferred",
  confidence: typeof d.confidence === "number" ? d.confidence : 0,
  evidence: (d.evidence as MemoryFact["evidence"]) ?? null,
  status: (d.status as FactStatus) ?? "suggested",
  validFrom: typeof d.validFrom === "string" ? d.validFrom : null,
  validUntil: typeof d.validUntil === "string" ? d.validUntil : null,
});

const store = localEntity<MemoryFact>({
  entity: "memory_fact",
  table: "memory_facts",
  columns: ["key", "data", "status"],
  toColumns: (f) => [f.key, JSON.stringify(f), f.status],
  toPayload: ({ id: _id, ...f }) => f,
  fromServer: toFact,
  fromRow: (r) => toFact(String(r.id), obj(r.data)),
});

export const useFactsVersion = store.useVersion;

export function factsFor(userId: string): MemoryFact[] {
  const latest = new Map<string, MemoryFact>();
  for (const f of store.rows(`user_id = ? AND deleted = 0 ORDER BY client_updated_at`, userId)) latest.set(f.key, f);
  return [...latest.values()];
}

export function setFactStatus(userId: string, fact: MemoryFact, status: FactStatus) {
  store.write(userId, { ...fact, status });
}

export function updateFact(userId: string, fact: MemoryFact, patch: Partial<Pick<MemoryFact, "text" | "value">>) {
  // An edited fact is the user's now, so inference never overwrites it (mergeFacts).
  store.write(userId, { ...fact, ...patch, source: "user" });
}

export function deleteFact(userId: string, fact: MemoryFact) {
  store.remove(userId, fact);
}

/** D78: a fact from chat, saved only after the user said yes. Active straight away. */
export function rememberFact(userId: string, text: string, source: "chat" | "user" = "chat"): MemoryFact {
  const key = noteKey(text);
  const existing = factsFor(userId).find((f) => f.key === key);
  const fact: MemoryFact = {
    id: existing?.id ?? newId(),
    key,
    kind: "preference",
    value: { text },
    text: text.trim().slice(0, 300),
    source,
    confidence: 1,
    evidence: null,
    status: "active",
    validFrom: null,
    validUntil: null,
  };
  store.write(userId, fact);
  return fact;
}

/**
 * D97 · The user fixed a mis-heard word ("dahl" → Dal tadka): remember it, so speech-to-text and matching get it right
 * the next time. One fact per spoken form; the user's own correction, so it's active straight away.
 */
export function rememberAlias(userId: string, value: AliasValue): MemoryFact {
  const base = aliasFact(value);
  const existing = factsFor(userId).find((f) => f.key === base.key);
  const fact: MemoryFact = { ...base, id: existing?.id ?? newId(), evidence: null, validFrom: null, validUntil: null };
  store.write(userId, fact);
  return fact;
}

/** D97 · The user's learned aliases, newest first. */
export const aliasesFor = (userId: string) => aliasesFrom(factsFor(userId));

/**
 * "Start fresh": let go of this week's earlier gaps, so the days from `from` plan at the usual numbers again. Lasts
 * for that Mon–Sun week only (the ledger never carries into the next one anyway). Undo = `clearFreshStart`.
 */
export function startFresh(userId: string, from: string, week: { monday: string; sunday: string; label: string }): MemoryFact {
  const existing = factsFor(userId).find((f) => f.key === FACT_KEYS.freshStart);
  const fact: MemoryFact = {
    id: existing?.id ?? newId(),
    key: FACT_KEYS.freshStart,
    kind: "event",
    value: { from },
    text: `Started this week fresh from ${week.label}: earlier gaps were let go.`,
    source: "user",
    confidence: 1,
    evidence: null,
    status: "active",
    validFrom: week.monday,
    validUntil: week.sunday,
  };
  store.write(userId, fact);
  return fact;
}

export function clearFreshStart(userId: string) {
  const existing = factsFor(userId).find((f) => f.key === FACT_KEYS.freshStart);
  if (existing) store.remove(userId, existing);
}

const jobKey = (userId: string) => `zorka.memoryJob.${userId}`;

const mealText = (items: { name: string; quantity: number }[]) =>
  items.map((i) => `${i.quantity !== 1 ? `${Math.round(i.quantity * 10) / 10} ` : ""}${i.name.split(" (")[0]!.toLowerCase()}`).join(" + ");
const mealKey = (items: { foodId: string | null; name: string }[]) =>
  items.map((i) => i.foodId ?? i.name.toLowerCase()).sort().join("|");
const minuteOf = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};

/** The last 28 days as the memory job reads them. */
export function logsWindow(userId: string, today: string, proteinTargetG: number): { days: LoggedDay[] } {
  const from = addDays(today, -MEMORY_WINDOW_DAYS);
  const to = addDays(today, -1);
  const meals = mealsBetween(userId, from, to);
  const workouts = workoutsBetween(userId, from, to);
  const water = glassesBetween(userId, from, to);
  return {
    days: datesBetween(from, to).map((date) => {
      const dayMeals = meals.filter((m) => m.localDate === date);
      const w = workouts.find((x) => x.localDate === date);
      const coverage = coverageFor(userId, date);
      return {
        date,
        meals: dayMeals.map((m) => ({ slot: m.mealType, at: minuteOf(m.loggedAt), key: mealKey(m.items), text: mealText(m.items) })),
        trainedAt: w ? minuteOf(w.startedAt) : null,
        proteinG: dayMeals.length ? dayMeals.reduce((s, m) => s + m.items.reduce((t, i) => t + i.proteinG, 0), 0) : null,
        proteinTargetG,
        glasses: water.get(date) ?? null,
        coverage,
      };
    }),
  };
}

/** Once a day (on first open): infer from the last 28 days and apply the changes. Returns how many changed. */
export function runMemoryJob(userId: string, today: string, proteinTargetG: number, force = false): number {
  if (!force && kv.get(jobKey(userId)) === today) return 0;
  kv.set(jobKey(userId), today);
  const changes = mergeFacts(factsFor(userId), inferFacts(logsWindow(userId, today, proteinTargetG), today));
  for (const c of changes) {
    if (c.type === "insert")
      store.write(userId, { id: newId(), source: "inferred", validFrom: null, validUntil: null, ...c.fact });
    else {
      const old = factsFor(userId).find((f) => f.id === c.id);
      if (old) store.write(userId, { ...old, ...c.patch });
    }
  }
  return changes.length;
}

export function useFacts(userId: string | null): MemoryFact[] {
  const stamp = store.useStamp();
  return useMemo(() => {
    void stamp;
    return userId ? factsFor(userId) : [];
  }, [userId, stamp]);
}

export function useActiveFacts(userId: string | null, today: string): ActiveFacts {
  const facts = useFacts(userId);
  return useMemo(() => activeFacts(facts, today), [facts, today]);
}
