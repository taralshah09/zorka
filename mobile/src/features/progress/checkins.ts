// P28 · Weekly adaptive targets + Sunday check-in (S35, D50). Computed lazily on the phone: the first time the app
// is opened on or after a Sunday, the week before it is evaluated with shared/domain/targets.ts weeklyCheckin.
// Nothing is stored until the user answers; the answer (accepted / kept / skipped) syncs as entity "checkin" and is
// the target history. The latest accepted check-in sets the targets from then on (D26).
import { randomUUID } from "expo-crypto";
import { useMemo } from "react";
import { create } from "zustand";

import type { Profile } from "@/core/api/types";
import { getDb } from "@/core/storage/db";
import { notifyLocalWrite, onAcknowledged, useSyncStatus } from "@/core/sync/engine";
import { enqueue } from "@/core/sync/outbox";
import { onPulled } from "@/core/sync/pull";
import { targetInputFromProfile } from "@/features/targets/targetInput";
import { localDate } from "@shared/domain/food";
import { addDays, checkinWindow, trendOn, type CheckinWindow, type TrendPoint } from "@shared/domain/progress";
import {
  calculateTargets,
  macrosFor,
  validateTargetInput,
  weeklyCheckin,
  type CheckinResult,
  type Targets,
} from "@shared/domain/targets";
import { phaseOn, type Phase } from "./phases";
import { completeIntake } from "./queries";

export type CheckinStatus = "accepted" | "kept" | "skipped";

export type Checkin = {
  id: string;
  userId: string;
  phaseId: string | null;
  checkinDate: string;
  status: CheckinStatus;
  loggedDays: number;
  previousKcal: number;
  newKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  avgIntakeKcal: number | null;
  estimatedBurnKcal: number | null;
  trendStartKg: number | null;
  trendEndKg: number | null;
  capped: boolean;
  /** When the user answered it. */
  answeredAt: string;
  synced: boolean;
};

type CheckinFields = Omit<Checkin, "id" | "userId" | "answeredAt" | "synced">;

export const useCheckinsVersion = create<{ v: number }>(() => ({ v: 0 }));
const bump = () => useCheckinsVersion.setState((s) => ({ v: s.v + 1 }));

onAcknowledged("checkin", (row) => {
  getDb().runSync(
    `UPDATE checkins SET synced = 1 WHERE id = ? AND client_updated_at = ?`,
    row.record_id,
    row.client_updated_at,
  );
});

type Row = { id: string; user_id: string; data: string; client_updated_at: string; synced: number };

const toCheckin = (r: Row): Checkin => ({
  ...(JSON.parse(r.data) as CheckinFields),
  id: r.id,
  userId: r.user_id,
  answeredAt: r.client_updated_at,
  synced: !!r.synced,
});

/** Oldest first. */
export const listCheckins = (userId: string): Checkin[] =>
  getDb()
    .getAllSync<Row>(
      `SELECT * FROM checkins WHERE user_id = ? AND deleted = 0 ORDER BY checkin_date, client_updated_at`,
      userId,
    )
    .map(toCheckin);

function write(userId: string, id: string, fields: CheckinFields, now = new Date().toISOString()) {
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT OR REPLACE INTO checkins (id, user_id, checkin_date, data, client_updated_at, deleted, synced)
       VALUES (?, ?, ?, ?, ?, 0, 0)`,
      id,
      userId,
      fields.checkinDate,
      JSON.stringify(fields),
      now,
    );
    enqueue({
      op_id: randomUUID(),
      user_id: userId,
      entity: "checkin",
      action: "upsert",
      record_id: id,
      payload: JSON.stringify(fields),
      client_updated_at: now,
    });
  });
  bump();
  notifyLocalWrite();
}

// ── Effective targets ────────────────────────────────────────────────────────────────────────────

export type TargetSource = "plan" | "phase" | "checkin";

/**
 * The targets in force on `day`. Starts from the plan derived from the profile (D26); a phase with its own kcal
 * overrides it; an accepted check-in inside that phase overrides both. Whichever of the phase targets and the
 * check-in was set last wins, and neither applies if the user redid setup after it.
 */
export function effectiveTargets(
  base: Targets,
  profile: Profile,
  phases: readonly Phase[],
  checkins: readonly Checkin[],
  day: string,
): { targets: Targets; source: TargetSource; checkin: Checkin | null } {
  const since = profile.onboardedAt ?? "";
  const weightKg = profile.weightKg ?? 0;
  const phase = phaseOn(phases, day);
  // UX N3: a phase set up after the plan with another goal or target weight ("Change goal") plans for that goal,
  // e.g. a new "Build muscle" phase that starts next Monday switches the targets that day.
  const plan = phase && phase.updatedAt > since ? planFor(profile, phase, base) : base;
  const latest = [...checkins]
    .reverse()
    .find(
      (c) =>
        c.status === "accepted" &&
        c.newKcal != null &&
        c.checkinDate <= day &&
        c.answeredAt > since &&
        (phase ? c.phaseId === phase.id : true),
    );
  const phaseTargets = phase && phase.kcal != null && phase.updatedAt > since ? phase : null;

  if (latest && (!phaseTargets || latest.answeredAt > phaseTargets.updatedAt)) {
    const kcal = latest.newKcal!;
    return {
      targets: {
        ...plan,
        kcal,
        proteinG: latest.proteinG ?? plan.proteinG,
        carbsG: latest.carbsG ?? plan.carbsG,
        fatG: latest.fatG ?? plan.fatG,
      },
      source: "checkin",
      checkin: latest,
    };
  }
  if (phaseTargets) {
    const kcal = phaseTargets.kcal!;
    return {
      targets: { ...plan, kcal, ...macrosFor(kcal, phaseTargets.proteinG ?? plan.proteinG, weightKg) },
      source: "phase",
      checkin: null,
    };
  }
  return { targets: plan, source: "plan", checkin: null };
}

// ── The pending check-in ─────────────────────────────────────────────────────────────────────────

export type PendingCheckin = {
  window: CheckinWindow;
  result: CheckinResult;
  phaseId: string | null;
  previousKcal: number;
  trendStartKg: number | null;
  trendEndKg: number | null;
  /** Last weigh-in of the week minus the last one before it (the "scale says" number). */
  scaleChangeKg: number | null;
};

/** The plan for a phase's goal and target weight, or the profile's plan when the phase doesn't change them. */
function planFor(profile: Profile, phase: Phase | null, base: Targets): Targets {
  if (!phase || (phase.goal === profile.goal && phase.targetWeightKg === profile.targetWeightKg)) return base;
  const input = targetInputFromProfile(profile);
  if (!input) return base;
  const forPhase = { ...input, goal: phase.goal, targetWeightKg: phase.targetWeightKg, pace: input.pace ?? "steady" };
  return validateTargetInput(forPhase).length ? { ...base, adjustmentKcal: 0 } : calculateTargets(forPhase);
}

/**
 * This week's check-in, or null when it's answered already or the user wasn't set up yet during the week it covers.
 */
export function pendingCheckin(input: {
  userId: string;
  profile: Profile;
  base: Targets;
  phases: readonly Phase[];
  checkins: readonly Checkin[];
  series: readonly TrendPoint[];
  today: string;
}): PendingCheckin | null {
  const { userId, profile, base, phases, checkins, series, today } = input;
  const window = checkinWindow(today);
  if (!profile.onboardedAt || localDate(new Date(profile.onboardedAt)) > window.end) return null;
  if (checkins.some((c) => c.checkinDate === window.checkinDate)) return null;

  const phase = phaseOn(phases, window.end);
  const current = effectiveTargets(base, profile, phases, checkins, window.end).targets;
  const plan = planFor(profile, phase, base);
  const before = addDays(window.start, -1);
  const trendStartKg = trendOn(series, before);
  const trendEndKg = trendOn(series, window.end);
  const inWeek = series.filter((p) => p.date >= window.start && p.date <= window.end);
  const lastBefore = [...series].reverse().find((p) => p.date <= before);

  const result = weeklyCheckin({
    goal: phase?.goal ?? profile.goal ?? "maintain",
    loggedKcal: completeIntake(userId, window.start, window.end)
      .filter((d) => d.kcal > 0)
      .map((d) => d.kcal),
    trendStartKg,
    trendEndKg,
    weighedInWeek: inWeek.length > 0 && !!lastBefore && lastBefore.date >= addDays(window.start, -7),
    currentKcal: current.kcal,
    floorKcal: base.floorKcal,
    adjustmentKcal: plan.adjustmentKcal,
  });

  return {
    window,
    result,
    phaseId: phase?.id ?? null,
    previousKcal: current.kcal,
    trendStartKg,
    trendEndKg,
    scaleChangeKg: inWeek.length && lastBefore ? inWeek[inWeek.length - 1]!.scaleKg - lastBefore.scaleKg : null,
  };
}

/** S35 "Accept new target" / "Keep current" / "Got it" (not enough data). */
export function answerCheckin(userId: string, pending: PendingCheckin, status: CheckinStatus) {
  const r = pending.result;
  const ready = r.status === "ready" ? r : null;
  write(userId, randomUUID(), {
    phaseId: pending.phaseId,
    checkinDate: pending.window.checkinDate,
    status: ready ? status : "skipped",
    loggedDays: r.loggedDays,
    previousKcal: pending.previousKcal,
    newKcal: ready?.newKcal ?? null,
    proteinG: ready?.proteinG ?? null,
    carbsG: ready?.carbsG ?? null,
    fatG: ready?.fatG ?? null,
    avgIntakeKcal: ready ? Math.round(ready.avgIntakeKcal) : null,
    estimatedBurnKcal: ready ? Math.round(ready.estimatedBurnKcal) : null,
    trendStartKg: ready ? pending.trendStartKg : null,
    trendEndKg: ready ? pending.trendEndKg : null,
    capped: ready?.capped ?? false,
  });
}

// ── Pull ─────────────────────────────────────────────────────────────────────────────────────────

onPulled("checkin", {
  apply(userId, { id, deleted, data }) {
    const db = getDb();
    const local = db.getFirstSync<{ synced: number; client_updated_at: string }>(
      `SELECT synced, client_updated_at FROM checkins WHERE id = ?`,
      id,
    );
    if (local && !local.synced) return; // an unsynced local edit wins until the outbox has pushed it
    if (deleted) {
      db.runSync(`DELETE FROM checkins WHERE id = ?`, id);
      return;
    }
    const { id: _id, clientUpdatedAt, ...fields } = data as CheckinFields & { id: string; clientUpdatedAt: string };
    if (local?.client_updated_at === clientUpdatedAt) return;
    db.runSync(
      `INSERT OR REPLACE INTO checkins (id, user_id, checkin_date, data, client_updated_at, deleted, synced)
       VALUES (?, ?, ?, ?, ?, 0, 1)`,
      id,
      userId,
      fields.checkinDate,
      JSON.stringify(fields),
      clientUpdatedAt,
    );
  },

  requeueMissing(userId, onServer) {
    const missing = listCheckins(userId).filter((c) => c.synced && !onServer.has(c.id));
    for (const { id, userId: _u, answeredAt, synced: _s, ...fields } of missing) write(userId, id, fields, answeredAt);
    return missing.length;
  },

  changed: bump,
});

export function useCheckins(userId: string | null): Checkin[] {
  const v = useCheckinsVersion((s) => s.v);
  const sync = useSyncStatus((s) => s.lastSyncedAt);
  return useMemo(() => {
    void v;
    void sync;
    return userId ? listCheckins(userId) : [];
  }, [userId, v, sync]);
}
