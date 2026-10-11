// POST /v1/users/:id/sync — batch of outbox operations from the phone.
// Each op is idempotent (client-generated ids) and resolved last-write-wins by clientUpdatedAt.
import { z } from "zod";

export const SYNC_ENTITIES = [
  "sync_probe",
  "meal_log",
  "custom_food",
  "custom_exercise",
  "workout",
  "routine",
] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const SyncOp = z.object({
  opId: z.string().uuid(),
  entity: z.enum(SYNC_ENTITIES),
  action: z.enum(["upsert", "delete"]),
  id: z.string().uuid(),
  clientUpdatedAt: z.string().datetime(),
  data: z.unknown().optional(),
});
export type SyncOp = z.infer<typeof SyncOp>;

export const SyncBody = z.object({ ops: z.array(SyncOp).min(1).max(100) }).strict();

/** applied = written · stale = server already has a newer version (client can drop it) ·
 *  rejected = invalid payload (client keeps it as failed and surfaces the error). */
export type SyncResult = { opId: string; status: "applied" | "stale" | "rejected"; message?: string };

export const SyncProbeData = z.object({ note: z.string().min(1).max(200) }).strict();
