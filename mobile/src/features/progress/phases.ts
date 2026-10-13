// P29 · Phases as projects (S36–S39, D51). Local-first (D23), synced as entity "phase".
// One active phase at a time (closedDate null). Logs aren't tagged: they belong to whichever phase covered their
// date. A user without any phase gets "Phase 1" from their onboarding plan, once this phone holds their data.
import { randomUUID } from "expo-crypto";
import { useEffect, useMemo } from "react";
import { create } from "zustand";

import type { Goal, Profile } from "@/core/api/types";
import { getDb } from "@/core/storage/db";
import { notifyLocalWrite, onAcknowledged, useSyncStatus } from "@/core/sync/engine";
import { enqueue } from "@/core/sync/outbox";
import { hasPulledOnce, onPulled, usePullStatus } from "@/core/sync/pull";
import { localDate } from "@shared/domain/food";
import { addDays, phaseSummary, type PhaseSummary, type TrendPoint } from "@shared/domain/progress";
import { goalHasPace, type Targets } from "@shared/domain/targets";
import { activityDistanceM, dayIntake, loggedDates, workoutCounts } from "./queries";

export type Phase = {
  id: string;
  userId: string;
  name: string;
  goal: Goal;
  startDate: string;
  /** Planned end; null = open-ended. */
  endDate: string | null;
  targetWeightKg: number | null;
  /** null = follow the plan from the profile. */
  kcal: number | null;
  proteinG: number | null;
  closedDate: string | null;
  summary: PhaseSummary | null;
  /** When this version was written (orders phase targets against check-ins). */
  updatedAt: string;
  synced: boolean;
};

type PhaseFields = Omit<Phase, "id" | "userId" | "updatedAt" | "synced">;

export const usePhasesVersion = create<{ v: number }>(() => ({ v: 0 }));
const bump = () => usePhasesVersion.setState((s) => ({ v: s.v + 1 }));

onAcknowledged("phase", (row) => {
  getDb().runSync(
    `UPDATE phases SET synced = 1 WHERE id = ? AND client_updated_at = ?`,
    row.record_id,
    row.client_updated_at,
  );
});

type Row = { id: string; user_id: string; data: string; client_updated_at: string; synced: number };

const toPhase = (r: Row): Phase => ({
  ...(JSON.parse(r.data) as PhaseFields),
  id: r.id,
  userId: r.user_id,
  updatedAt: r.client_updated_at,
  synced: !!r.synced,
});

/** Newest first; on the same start day the open phase comes first (it wins phaseOn). */
export const listPhases = (userId: string): Phase[] =>
  getDb()
    .getAllSync<Row>(
      `SELECT * FROM phases WHERE user_id = ? AND deleted = 0 ORDER BY start_date DESC, closed_date IS NULL DESC, id`,
      userId,
    )
    .map(toPhase);

export const activePhase = (phases: readonly Phase[]) => phases.find((p) => !p.closedDate) ?? null;

export function getPhase(id: string): Phase | null {
  const row = getDb().getFirstSync<Row>(`SELECT * FROM phases WHERE id = ? AND deleted = 0`, id);
  return row ? toPhase(row) : null;
}

/** The phase a day belongs to: the latest-starting one whose range covers it. */
export const phaseOn = (phases: readonly Phase[], day: string) =>
  phases.find((p) => p.startDate <= day && (!p.closedDate || p.closedDate >= day)) ?? null;

function write(userId: string, id: string, fields: PhaseFields, now = new Date().toISOString()) {
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT OR REPLACE INTO phases (id, user_id, start_date, closed_date, data, client_updated_at, deleted, synced)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
      id,
      userId,
      fields.startDate,
      fields.closedDate,
      JSON.stringify(fields),
      now,
    );
    enqueue({
      op_id: randomUUID(),
      user_id: userId,
      entity: "phase",
      action: "upsert",
      record_id: id,
      payload: JSON.stringify(fields),
      client_updated_at: now,
    });
  });
  bump();
  notifyLocalWrite();
}

const fieldsOf = ({ id: _i, userId: _u, updatedAt: _a, synced: _s, ...f }: Phase): PhaseFields => f;

/** Stats for a phase between its start and `end` (today while active, the closing day once closed). */
export function computeSummary(p: Pick<Phase, "userId" | "startDate">, end: string, series: readonly TrendPoint[]) {
  return phaseSummary({
    start: p.startDate,
    end,
    series,
    intake: dayIntake(p.userId, p.startDate, end),
    ...workoutCounts(p.userId, p.startDate, end),
    distanceM: activityDistanceM(p.userId, p.startDate, end),
  });
}

/** Closes a phase on `day` and freezes its summary (S39). */
export function closePhase(p: Phase, series: readonly TrendPoint[], day = localDate(new Date())) {
  const closedDate = day < p.startDate ? p.startDate : day;
  write(p.userId, p.id, { ...fieldsOf(p), closedDate, summary: computeSummary(p, closedDate, series) });
}

export type PhaseInput = Pick<
  Phase,
  "name" | "goal" | "startDate" | "endDate" | "targetWeightKg" | "kcal" | "proteinG"
>;

/**
 * S37 Create / Save. Creating a phase while another is active closes that one the day before the new one starts
 * (only one is active at a time).
 */
export function savePhase(userId: string, input: PhaseInput, id: string | null, series: readonly TrendPoint[]): string {
  const existing = id ? getPhase(id) : null;
  if (!existing) {
    const current = activePhase(listPhases(userId));
    if (current) closePhase(current, series, addDays(input.startDate, -1));
  }
  const phaseId = existing?.id ?? randomUUID();
  write(userId, phaseId, {
    ...input,
    name: input.name.trim(),
    closedDate: existing?.closedDate ?? null,
    summary: existing?.summary ?? null,
  });
  return phaseId;
}

/**
 * UX O5 · The target weight was changed in Settings: the open phase follows it, so its plan (checkins.ts planFor)
 * doesn't keep aiming at the old one.
 */
export function followTargetWeight(userId: string, targetWeightKg: number | null) {
  const active = activePhase(listPhases(userId));
  if (!active || !goalHasPace(active.goal) || active.targetWeightKg === targetWeightKg) return;
  write(userId, active.id, { ...fieldsOf(active), targetWeightKg });
}

/** "Phase 1" from the onboarding plan (D51), for a user who has none yet. */
export function ensureFirstPhase(userId: string, profile: Profile, targets: Targets): boolean {
  if (!profile.goal || !profile.onboardedAt || !hasPulledOnce(userId)) return false;
  if (getDb().getFirstSync(`SELECT 1 FROM phases WHERE user_id = ?`, userId)) return false;
  const today = localDate(new Date());
  const first = loggedDates(userId)[0];
  write(userId, randomUUID(), {
    name: "Phase 1",
    goal: profile.goal,
    startDate: first && first < today ? first : today,
    endDate: targets.goalDate,
    targetWeightKg: goalHasPace(profile.goal) ? profile.targetWeightKg : null,
    kcal: null,
    proteinG: null,
    closedDate: null,
    summary: null,
  });
  return true;
}

// ── Pull ─────────────────────────────────────────────────────────────────────────────────────────

onPulled("phase", {
  apply(userId, { id, deleted, data }) {
    const db = getDb();
    const local = db.getFirstSync<{ synced: number; client_updated_at: string }>(
      `SELECT synced, client_updated_at FROM phases WHERE id = ?`,
      id,
    );
    if (local && !local.synced) return; // an unsynced local edit wins until the outbox has pushed it
    if (deleted) {
      db.runSync(`DELETE FROM phases WHERE id = ?`, id);
      return;
    }
    const { id: _id, clientUpdatedAt, ...fields } = data as PhaseFields & { id: string; clientUpdatedAt: string };
    if (local?.client_updated_at === clientUpdatedAt) return;
    db.runSync(
      `INSERT OR REPLACE INTO phases (id, user_id, start_date, closed_date, data, client_updated_at, deleted, synced)
       VALUES (?, ?, ?, ?, ?, ?, 0, 1)`,
      id,
      userId,
      fields.startDate,
      fields.closedDate,
      JSON.stringify(fields),
      clientUpdatedAt,
    );
  },

  requeueMissing(userId, onServer) {
    const missing = listPhases(userId).filter((p) => p.synced && !onServer.has(p.id));
    for (const p of missing) write(userId, p.id, fieldsOf(p));
    return missing.length;
  },

  changed: bump,
});

// ── Hooks ────────────────────────────────────────────────────────────────────────────────────────

export function usePhases(userId: string | null): Phase[] {
  const v = usePhasesVersion((s) => s.v);
  const sync = useSyncStatus((s) => s.lastSyncedAt);
  return useMemo(() => {
    void v;
    void sync;
    return userId ? listPhases(userId) : [];
  }, [userId, v, sync]);
}

/** Creates "Phase 1" once the user is set up and this phone has pulled their data. */
export function useEnsureFirstPhase(userId: string | null, profile: Profile | undefined, targets: Targets | null) {
  const pulledAt = usePullStatus((s) => s.lastPulledAt);
  useEffect(() => {
    if (userId && profile && targets) ensureFirstPhase(userId, profile, targets);
  }, [userId, profile, targets, pulledAt]);
}
