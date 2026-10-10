// Sync engine: pushes the outbox to POST /v1/users/:id/sync when online.
// Triggers: app start, after every local write, reconnect, app foreground, and scheduled retries.
// Conflict rule (P07 gate): last-write-wins on clientUpdatedAt, decided by the server.
import { AppState } from "react-native";
import { create } from "zustand";

import { api, ApiError } from "@/core/api/client";
import type { SyncEntity, SyncOp, SyncResult } from "@/core/api/types";
import { useNetwork } from "@/core/network/network";
import {
  counts,
  markFailed,
  nextBatch,
  removeOps,
  resetBackoff,
  retryFailed,
  scheduleRetry,
  toSyncOp,
  type OutboxRow,
} from "./outbox";

type SyncStatus = {
  pending: number;
  failed: number;
  syncing: boolean;
  lastSyncedAt: number | null;
  lastError: string | null;
};

export const useSyncStatus = create<SyncStatus>(() => ({
  pending: 0,
  failed: 0,
  syncing: false,
  lastSyncedAt: null,
  lastError: null,
}));

/** Entities register a hook to mark their local row as synced once the server acknowledges it. */
const ackHandlers: Partial<Record<SyncEntity, (row: OutboxRow) => void>> = {};
export function onAcknowledged(entity: SyncEntity, fn: (row: OutboxRow) => void) {
  ackHandlers[entity] = fn;
}

let running = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

function refreshCounts() {
  const c = counts();
  useSyncStatus.setState({ pending: c.pending, failed: c.failed });
  clearTimeout(retryTimer);
  if (c.pending > 0 && c.nextAttemptAt && useNetwork.getState().online) {
    retryTimer = setTimeout(() => void flush(), Math.max(250, c.nextAttemptAt - Date.now()));
  }
}

function isTransient(err: unknown) {
  return !(err instanceof ApiError) || err.kind !== "http" || (err.status ?? 500) >= 500 || err.status === 429;
}

/** Push everything that's due. Safe to call any time; concurrent calls are coalesced. */
export async function flush(): Promise<void> {
  if (running) return;
  if (!useNetwork.getState().online) {
    refreshCounts();
    return;
  }
  running = true;
  useSyncStatus.setState({ syncing: true });
  try {
    for (let batch = nextBatch(Date.now()); batch; batch = nextBatch(Date.now())) {
      const { userId, rows } = batch;
      const ops: SyncOp[] = rows.map(toSyncOp);
      let results: SyncResult[];
      try {
        ({ results } = await api<{ results: SyncResult[] }>(`/users/${userId}/sync`, {
          method: "POST",
          body: { ops },
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Sync failed";
        if (isTransient(err)) {
          scheduleRetry(
            rows.map((r) => r.op_id),
            message,
            Date.now(),
          );
          useSyncStatus.setState({ lastError: message });
          break;
        }
        // Permanent rejection of the whole batch (e.g. 404 user, 422 envelope): park the ops as failed.
        rows.forEach((r) => markFailed(r.op_id, message));
        useSyncStatus.setState({ lastError: message });
        continue;
      }

      const byId = new Map(rows.map((r) => [r.op_id, r]));
      const done: string[] = [];
      for (const r of results) {
        const row = byId.get(r.opId);
        if (!row) continue;
        if (r.status === "rejected") {
          markFailed(r.opId, r.message ?? "Rejected by server");
        } else {
          // applied, or stale (the server already holds a newer version) — either way it's settled.
          ackHandlers[row.entity]?.(row);
          done.push(r.opId);
        }
      }
      removeOps(done);
      useSyncStatus.setState({ lastSyncedAt: Date.now(), lastError: null });
    }
  } finally {
    running = false;
    useSyncStatus.setState({ syncing: false });
    refreshCounts();
  }
}

export function retryFailedNow() {
  retryFailed();
  void flush();
}

let started = false;

/** Call once at app start, after network monitoring is running. */
export function startSyncEngine(): void {
  if (started) return;
  started = true;
  refreshCounts();
  void flush();

  let wasOnline = useNetwork.getState().online;
  useNetwork.subscribe(({ online }) => {
    if (online && !wasOnline) {
      resetBackoff();
      void flush();
    } else if (!online) {
      refreshCounts();
    }
    wasOnline = online;
  });

  AppState.addEventListener("change", (state) => {
    if (state === "active") void flush();
  });
}

/** Call after any local write that enqueued an op. */
export function notifyLocalWrite() {
  refreshCounts();
  void flush();
}
