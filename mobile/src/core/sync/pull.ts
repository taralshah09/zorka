// Pull side of sync: GET /v1/users/:id/changes brings the server's copy down into SQLite, so a new phone or a
// reinstall gets the user's history back. The outbox (engine.ts) is the push side.
//
// Each entity registers how to apply a server record. Local rows with unsynced changes are never overwritten:
// their outbox op is still on its way and the server decides (last-write-wins).
//
// A full pull (first run for a user, then once a day) also reconciles the other way: anything this phone
// holds that the server doesn't is queued again, so nothing lives only on the phone.
import { useEffect } from "react";
import { AppState } from "react-native";
import { create } from "zustand";

import { api } from "@/core/api/client";
import type { Change, ChangesPage, PullEntity } from "@/core/api/types";
import { useNetwork } from "@/core/network/network";
import { getDb } from "@/core/storage/db";
import { kv } from "@/core/storage/kv";
import { notifyLocalWrite } from "./engine";

export type Puller = {
  /** Writes one server record into SQLite. Runs inside the page's transaction. */
  apply(userId: string, change: Change): void;
  /** Full pull only: queue local records the server didn't send. Returns how many were queued. */
  requeueMissing(userId: string, onServer: ReadonlySet<string>): number;
  /** Re-read hook for the entity's screens. */
  changed(): void;
};

const pullers: Partial<Record<PullEntity, Puller>> = {};
export function onPulled(entity: PullEntity, puller: Puller) {
  pullers[entity] = puller;
}

export const usePullStatus = create<{ pulling: boolean; lastPulledAt: number | null; lastError: string | null }>(
  () => ({ pulling: false, lastPulledAt: null, lastError: null }),
);

const cursorKey = (userId: string) => `kimbo.pullCursor.${userId}`;
const fullAtKey = (userId: string) => `kimbo.pullFullAt.${userId}`;
const FULL_EVERY_MS = 24 * 60 * 60 * 1000;

/** A full pull has finished for this user on this phone, so its local copy holds everything the server had. */
export const hasPulledOnce = (userId: string) => kv.get(fullAtKey(userId)) != null;
/** The next pull starts a little before the cursor, so a write that committed late isn't skipped. */
const OVERLAP_MS = 5_000;
const MAX_PAGES = 500;

let inFlight: Promise<void> | null = null;

/** Pulls the user's changes. Concurrent calls share one run. */
export function pullChanges(userId: string, { full = false } = {}): Promise<void> {
  inFlight ??= run(userId, full).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(userId: string, forceFull: boolean) {
  const cursor = kv.get(cursorKey(userId));
  const full = forceFull || !cursor || Date.now() - Number(kv.get(fullAtKey(userId)) ?? 0) > FULL_EVERY_MS;
  const seen = new Map<PullEntity, Set<string>>();
  const touched = new Set<PullEntity>();
  let since = full ? null : cursor;

  usePullStatus.setState({ pulling: true });
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await api<ChangesPage>(
        `/users/${userId}/changes${since ? `?since=${encodeURIComponent(since)}` : ""}`,
        { timeoutMs: 30_000 },
      );
      const db = getDb();
      db.withTransactionSync(() => {
        for (const c of res.changes) {
          const p = pullers[c.entity];
          if (!p) continue;
          p.apply(userId, c);
          touched.add(c.entity);
          if (!seen.has(c.entity)) seen.set(c.entity, new Set());
          seen.get(c.entity)!.add(c.id);
        }
      });
      const stuck = res.cursor === since;
      since = res.cursor;
      if (!res.more || stuck) break;
    }

    let queued = 0;
    if (full) {
      for (const [entity, p] of Object.entries(pullers) as [PullEntity, Puller][]) {
        const n = p.requeueMissing(userId, seen.get(entity) ?? new Set());
        if (n) touched.add(entity);
        queued += n;
      }
      kv.set(fullAtKey(userId), String(Date.now()));
    }
    if (since) kv.set(cursorKey(userId), new Date(Date.parse(since) - OVERLAP_MS).toISOString());
    for (const e of touched) pullers[e]?.changed();
    if (queued) notifyLocalWrite();
    usePullStatus.setState({ pulling: false, lastPulledAt: Date.now(), lastError: null });
  } catch (err) {
    usePullStatus.setState({ pulling: false, lastError: err instanceof Error ? err.message : "Pull failed" });
    throw err;
  }
}

/** Keeps the active user's data in step with the server: on start, user switch, reconnect and foreground. */
export function usePullSync(userId: string | null) {
  const online = useNetwork((s) => s.online);
  useEffect(() => {
    if (userId && online) pullChanges(userId).catch(() => {});
  }, [userId, online]);
  useEffect(() => {
    if (!userId) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && useNetwork.getState().online) pullChanges(userId).catch(() => {});
    });
    return () => sub.remove();
  }, [userId]);
}
