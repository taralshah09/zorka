// LA3 · Day plans on the phone ("day_plan"). The plan is recomputed on the phone whenever its inputs change; it is saved
// (and synced, so a new phone shows the same day) only when the inputs hash changes, or when the user accepts it.
import { useMemo } from "react";

import type { DayPlan } from "@shared/domain/planDay";
import { localEntity, newId } from "./local";

export type StoredPlan = { id: string; localDate: string; plan: DayPlan; inputsHash: string; acceptedAt: string | null };

const parse = (raw: unknown): DayPlan | null => {
  try {
    const p = (typeof raw === "string" ? JSON.parse(raw) : raw) as DayPlan;
    return p && typeof p === "object" && Array.isArray(p.items) ? p : null;
  } catch {
    return null;
  }
};

const store = localEntity<StoredPlan>({
  entity: "day_plan",
  table: "day_plans",
  columns: ["local_date", "plan", "inputs_hash", "accepted_at"],
  toColumns: (p) => [p.localDate, JSON.stringify(p.plan), p.inputsHash, p.acceptedAt],
  toPayload: (p) => ({ localDate: p.localDate, plan: p.plan, inputsHash: p.inputsHash, acceptedAt: p.acceptedAt }),
  fromServer: (id, d) => ({
    id,
    localDate: String(d.localDate),
    plan: parse(d.plan)!,
    inputsHash: String(d.inputsHash),
    acceptedAt: typeof d.acceptedAt === "string" ? d.acceptedAt : null,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    localDate: String(r.local_date),
    plan: parse(r.plan)!,
    inputsHash: String(r.inputs_hash),
    acceptedAt: typeof r.accepted_at === "string" ? r.accepted_at : null,
  }),
});

export function planFor(userId: string, date: string): StoredPlan | null {
  const row = store.rows(`user_id = ? AND local_date = ? AND deleted = 0 ORDER BY client_updated_at DESC LIMIT 1`, userId, date)[0];
  return row?.plan ? row : null;
}

/** Saves the date's plan (one row per date). Acceptance carries over when the plan is refreshed. */
export function savePlan(userId: string, date: string, plan: DayPlan, inputsHash: string, accept = false): StoredPlan {
  const existing = planFor(userId, date);
  const stored: StoredPlan = {
    id: existing?.id ?? newId(),
    localDate: date,
    plan,
    inputsHash,
    acceptedAt: accept ? new Date().toISOString() : (existing?.acceptedAt ?? null),
  };
  store.write(userId, stored);
  return stored;
}

export function useStoredPlan(userId: string | null, date: string): StoredPlan | null {
  const stamp = store.useStamp();
  return useMemo(() => {
    void stamp;
    return userId ? planFor(userId, date) : null;
  }, [userId, date, stamp]);
}
