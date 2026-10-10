// Outbox queue (P07 gate): FIFO per user, client-generated UUIDs, retries with exponential backoff.
import type { SyncEntity, SyncOp } from "@/core/api/types";
import { getDb } from "@/core/storage/db";

export type OutboxRow = {
  op_id: string;
  user_id: string;
  entity: SyncEntity;
  action: "upsert" | "delete";
  record_id: string;
  payload: string | null;
  client_updated_at: string;
  created_at: number;
  status: "pending" | "failed";
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
};

export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 120_000;

/** 2 s, 4 s, 8 s … capped at 2 min. */
export const backoffMs = (attempts: number) =>
  Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));

/** Inserts an outbox row. Call inside the same transaction as the local write. */
export function enqueue(op: Omit<OutboxRow, "status" | "attempts" | "next_attempt_at" | "last_error" | "created_at">) {
  getDb().runSync(
    `INSERT INTO outbox (op_id, user_id, entity, action, record_id, payload, client_updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    op.op_id,
    op.user_id,
    op.entity,
    op.action,
    op.record_id,
    op.payload,
    op.client_updated_at,
    Date.now(),
  );
}

/** Oldest due pending ops for the user that owns the oldest due op (FIFO per user). */
export function nextBatch(now: number, limit = 50): { userId: string; rows: OutboxRow[] } | null {
  const db = getDb();
  const head = db.getFirstSync<{ user_id: string }>(
    `SELECT user_id FROM outbox WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY created_at LIMIT 1`,
    now,
  );
  if (!head) return null;
  const rows = db.getAllSync<OutboxRow>(
    `SELECT * FROM outbox WHERE status = 'pending' AND user_id = ? AND next_attempt_at <= ? ORDER BY created_at LIMIT ?`,
    head.user_id,
    now,
    limit,
  );
  return { userId: head.user_id, rows };
}

export const toSyncOp = (r: OutboxRow): SyncOp => ({
  opId: r.op_id,
  entity: r.entity,
  action: r.action,
  id: r.record_id,
  clientUpdatedAt: r.client_updated_at,
  data: r.payload ? JSON.parse(r.payload) : undefined,
});

export function removeOps(opIds: string[]) {
  if (!opIds.length) return;
  getDb().runSync(`DELETE FROM outbox WHERE op_id IN (${opIds.map(() => "?").join(",")})`, ...opIds);
}

export function markFailed(opId: string, error: string) {
  getDb().runSync(`UPDATE outbox SET status = 'failed', last_error = ? WHERE op_id = ?`, error, opId);
}

/** Transient failure (offline, timeout, 5xx): keep the ops and schedule a retry. */
export function scheduleRetry(opIds: string[], error: string, now: number) {
  const db = getDb();
  db.withTransactionSync(() => {
    for (const id of opIds) {
      const row = db.getFirstSync<{ attempts: number }>(`SELECT attempts FROM outbox WHERE op_id = ?`, id);
      const attempts = (row?.attempts ?? 0) + 1;
      db.runSync(
        `UPDATE outbox SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE op_id = ?`,
        attempts,
        now + backoffMs(attempts),
        error,
        id,
      );
    }
  });
}

/** Retry now: failed ops back to pending, and clear any backoff (e.g. on reconnect). */
export function resetBackoff() {
  getDb().runSync(`UPDATE outbox SET next_attempt_at = 0 WHERE status = 'pending'`);
}

export function retryFailed() {
  getDb().runSync(`UPDATE outbox SET status = 'pending', attempts = 0, next_attempt_at = 0 WHERE status = 'failed'`);
}

export function counts(): { pending: number; failed: number; nextAttemptAt: number | null } {
  const row = getDb().getFirstSync<{ pending: number; failed: number; next: number | null }>(
    `SELECT
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
       MIN(CASE WHEN status = 'pending' THEN next_attempt_at END) AS next
     FROM outbox`,
  );
  return { pending: row?.pending ?? 0, failed: row?.failed ?? 0, nextAttemptAt: row?.next ?? null };
}
