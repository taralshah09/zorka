// Local-first plumbing shared by the life plan entities (day_brief, day_plan, memory_fact). Same rules as water/store.ts
// (D23): every write goes to SQLite with an outbox op in one transaction; the server copy comes back through the pull,
// and an unsynced local edit wins until its op has been pushed. Each entity names its table and maps a row to the
// payload the server validates (backend/src/modules/life/life.schemas.ts).
import { randomUUID } from "expo-crypto";
import { create } from "zustand";

import type { PullEntity, SyncEntity } from "@/core/api/types";
import { getDb } from "@/core/storage/db";
import { notifyLocalWrite, onAcknowledged, useSyncStatus } from "@/core/sync/engine";
import { enqueue } from "@/core/sync/outbox";
import { onPulled } from "@/core/sync/pull";

export type LocalSpec<T extends { id: string }> = {
  entity: SyncEntity & PullEntity;
  table: string;
  /** Columns besides id, user_id, client_updated_at, deleted and synced. */
  columns: readonly string[];
  /** Record → column values, in `columns` order. */
  toColumns(r: T): (string | number | null)[];
  /** Record → the server payload. */
  toPayload(r: T): unknown;
  /** Server DTO → record. */
  fromServer(id: string, data: Record<string, unknown>): T;
  /** SQLite row → record. */
  fromRow(row: Record<string, unknown>): T;
};

export function localEntity<T extends { id: string }>(spec: LocalSpec<T>) {
  const useVersion = create<{ v: number }>(() => ({ v: 0 }));
  const bump = () => useVersion.setState((s) => ({ v: s.v + 1 }));
  const cols = ["id", "user_id", ...spec.columns, "client_updated_at", "deleted", "synced"];
  const insert = `INSERT OR REPLACE INTO ${spec.table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;

  onAcknowledged(spec.entity, (row) => {
    getDb().runSync(`UPDATE ${spec.table} SET synced = 1 WHERE id = ? AND client_updated_at = ?`, row.record_id, row.client_updated_at);
  });

  function write(userId: string, r: T, deleted = false) {
    const now = new Date().toISOString();
    const db = getDb();
    db.withTransactionSync(() => {
      db.runSync(insert, r.id, userId, ...spec.toColumns(r), now, deleted ? 1 : 0, 0);
      enqueue({
        op_id: randomUUID(),
        user_id: userId,
        entity: spec.entity,
        action: deleted ? "delete" : "upsert",
        record_id: r.id,
        payload: deleted ? null : JSON.stringify(spec.toPayload(r)),
        client_updated_at: now,
      });
    });
    bump();
    notifyLocalWrite();
  }

  onPulled(spec.entity, {
    apply(userId, { id, deleted, data }) {
      const db = getDb();
      const local = db.getFirstSync<{ synced: number; client_updated_at: string }>(
        `SELECT synced, client_updated_at FROM ${spec.table} WHERE id = ?`,
        id,
      );
      if (local && !local.synced) return;
      if (deleted) {
        db.runSync(`DELETE FROM ${spec.table} WHERE id = ?`, id);
        return;
      }
      const d = data as Record<string, unknown> & { clientUpdatedAt: string };
      if (local?.client_updated_at === d.clientUpdatedAt) return;
      db.runSync(insert, id, userId, ...spec.toColumns(spec.fromServer(id, d)), d.clientUpdatedAt, 0, 1);
    },
    requeueMissing(userId, onServer) {
      const missing = getDb()
        .getAllSync<Record<string, unknown>>(`SELECT * FROM ${spec.table} WHERE user_id = ? AND synced = 1 AND deleted = 0`, userId)
        .filter((r) => !onServer.has(String(r.id)))
        .map(spec.fromRow);
      for (const r of missing) write(userId, r);
      return missing.length;
    },
    changed: bump,
  });

  return {
    useVersion,
    write,
    remove: (userId: string, r: T) => write(userId, r, true),
    rows: (sql: string, ...args: (string | number)[]) =>
      getDb().getAllSync<Record<string, unknown>>(`SELECT * FROM ${spec.table} WHERE ${sql}`, ...args).map(spec.fromRow),
    /** Re-reads on local writes and when sync status changes. */
    useStamp() {
      const v = useVersion((s) => s.v);
      const sync = useSyncStatus((s) => s.lastSyncedAt);
      return `${v}:${sync}`;
    },
  };
}

export const newId = () => randomUUID();
