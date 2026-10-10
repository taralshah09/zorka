// Per-entity persistence for synced records. Each entity implements last-write-wins on
// clientUpdatedAt. New local-first entities (meals, workouts, …) register here in later phases.
import type { PrismaClient } from "../../generated/prisma/client.js";

export type ProbeRecord = { id: string; userId: string; note: string; clientUpdatedAt: Date; deletedAt: Date | null };

export interface SyncRepository {
  userExists(userId: string): Promise<boolean>;
  findProbe(id: string): Promise<ProbeRecord | null>;
  upsertProbe(rec: { id: string; userId: string; note: string; clientUpdatedAt: Date }): Promise<void>;
  softDeleteProbe(id: string, clientUpdatedAt: Date): Promise<void>;
  listProbes(userId: string): Promise<ProbeRecord[]>;
}

export function prismaSyncRepository(prisma: PrismaClient): SyncRepository {
  return {
    userExists: async (userId) => (await prisma.user.count({ where: { id: userId } })) > 0,

    findProbe: (id) => prisma.syncProbe.findUnique({ where: { id } }),

    upsertProbe: async ({ id, userId, note, clientUpdatedAt }) => {
      await prisma.syncProbe.upsert({
        where: { id },
        create: { id, userId, note, clientUpdatedAt },
        update: { note, clientUpdatedAt, deletedAt: null },
      });
    },

    softDeleteProbe: async (id, clientUpdatedAt) => {
      await prisma.syncProbe.update({ where: { id }, data: { deletedAt: clientUpdatedAt, clientUpdatedAt } });
    },

    listProbes: (userId) =>
      prisma.syncProbe.findMany({ where: { userId, deletedAt: null }, orderBy: { clientUpdatedAt: "desc" }, take: 50 }),
  };
}
