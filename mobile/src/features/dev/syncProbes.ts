// Dev-only local-first entity used to prove the outbox end to end (P07 "done when").
// Pattern for real entities: write locally + enqueue in ONE transaction, then notifyLocalWrite().
import { randomUUID } from "expo-crypto";
import { useCallback, useMemo, useState } from "react";

import { getDb } from "@/core/storage/db";
import { notifyLocalWrite, onAcknowledged, useSyncStatus } from "@/core/sync/engine";
import { enqueue } from "@/core/sync/outbox";

export type LocalProbe = { id: string; note: string; client_updated_at: string; synced: number };

onAcknowledged("sync_probe", (row) => {
  // Only mark synced if no newer local edit happened after this op was queued.
  getDb().runSync(
    `UPDATE sync_probes SET synced = 1 WHERE id = ? AND client_updated_at = ?`,
    row.record_id,
    row.client_updated_at,
  );
});

export function createProbe(userId: string, note: string): LocalProbe {
  const db = getDb();
  const probe = { id: randomUUID(), note, client_updated_at: new Date().toISOString(), synced: 0 };
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO sync_probes (id, user_id, note, client_updated_at) VALUES (?, ?, ?, ?)`,
      probe.id,
      userId,
      probe.note,
      probe.client_updated_at,
    );
    enqueue({
      op_id: randomUUID(),
      user_id: userId,
      entity: "sync_probe",
      action: "upsert",
      record_id: probe.id,
      payload: JSON.stringify({ note }),
      client_updated_at: probe.client_updated_at,
    });
  });
  notifyLocalWrite();
  return probe;
}

/** Local probes for a user. Re-reads (synchronously) whenever the sync status changes or
 *  `reload()` is called after a local write. */
export function useLocalProbes(userId: string | null) {
  const [version, setVersion] = useState(0);
  const stamp = useSyncStatus((s) => `${s.pending}:${s.failed}:${s.lastSyncedAt}`);

  const rows = useMemo<LocalProbe[]>(() => {
    void version;
    void stamp;
    if (!userId) return [];
    return getDb().getAllSync<LocalProbe>(
      `SELECT id, note, client_updated_at, synced FROM sync_probes WHERE user_id = ? AND deleted = 0
       ORDER BY client_updated_at DESC LIMIT 20`,
      userId,
    );
  }, [userId, version, stamp]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { rows, reload };
}
