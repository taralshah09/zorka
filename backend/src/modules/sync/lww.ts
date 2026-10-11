// Shared conflict rule for every synced entity (D23): last-write-wins on clientUpdatedAt, and a record
// never changes owner. Entity handlers call this first and stop if it returns a result.
import type { z } from "zod";

import type { SyncOp, SyncResult } from "./sync.schemas.js";

/** A sync handler for one entity, registered with the sync service. */
export type EntityHandler = (userId: string, op: SyncOp) => Promise<SyncResult>;

export function lwwGuard(
  userId: string,
  op: SyncOp,
  existing: { ownerId: string | null; clientUpdatedAt: Date | null } | null,
): SyncResult | null {
  if (existing && existing.ownerId !== userId) {
    return { opId: op.opId, status: "rejected", message: "Record belongs to another user" };
  }
  // An older (or equal, already-applied) write never overwrites a newer one.
  if (existing?.clientUpdatedAt && existing.clientUpdatedAt.getTime() > new Date(op.clientUpdatedAt).getTime()) {
    return { opId: op.opId, status: "stale" };
  }
  return null;
}

/** Validates op.data; a bad payload is "rejected" (the phone parks it as failed). */
export function parseOpData<S extends z.ZodType>(
  schema: S,
  op: SyncOp,
): { ok: true; data: z.infer<S> } | { ok: false; result: SyncResult } {
  const parsed = schema.safeParse(op.data);
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    result: {
      opId: op.opId,
      status: "rejected",
      message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    },
  };
}
