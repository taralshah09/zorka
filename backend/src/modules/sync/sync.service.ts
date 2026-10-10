import { notFound } from "../../http/errors.js";
import type { SyncRepository } from "./sync.repository.js";
import { SyncProbeData, type SyncOp, type SyncResult } from "./sync.schemas.js";

export function syncService(repo: SyncRepository) {
  async function applyProbe(userId: string, op: SyncOp): Promise<SyncResult> {
    const incomingAt = new Date(op.clientUpdatedAt);
    const existing = await repo.findProbe(op.id);

    if (existing && existing.userId !== userId) {
      return { opId: op.opId, status: "rejected", message: "Record belongs to another user" };
    }
    // Last-write-wins: an older (or equal, already-applied) write never overwrites a newer one.
    if (existing && existing.clientUpdatedAt.getTime() > incomingAt.getTime()) {
      return { opId: op.opId, status: "stale" };
    }

    if (op.action === "delete") {
      if (existing) await repo.softDeleteProbe(op.id, incomingAt);
      return { opId: op.opId, status: "applied" };
    }

    const data = SyncProbeData.safeParse(op.data);
    if (!data.success) {
      return { opId: op.opId, status: "rejected", message: data.error.issues.map((i) => i.message).join("; ") };
    }
    await repo.upsertProbe({ id: op.id, userId, note: data.data.note, clientUpdatedAt: incomingAt });
    return { opId: op.opId, status: "applied" };
  }

  return {
    /** Applies ops in order. One op failing validation doesn't block the rest of the batch. */
    async applyBatch(userId: string, ops: SyncOp[]): Promise<SyncResult[]> {
      if (!(await repo.userExists(userId))) throw notFound("User");
      const results: SyncResult[] = [];
      for (const op of ops) {
        switch (op.entity) {
          case "sync_probe":
            results.push(await applyProbe(userId, op));
            break;
        }
      }
      return results;
    },

    async listProbes(userId: string) {
      if (!(await repo.userExists(userId))) throw notFound("User");
      const rows = await repo.listProbes(userId);
      return rows.map((r) => ({ id: r.id, note: r.note, clientUpdatedAt: r.clientUpdatedAt.toISOString() }));
    },
  };
}

export type SyncService = ReturnType<typeof syncService>;
