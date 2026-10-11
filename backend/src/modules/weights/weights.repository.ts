// Persistence for weigh-ins.
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { WeightLogData } from "./weights.schemas.js";

export type WeightLogRecord = {
  id: string;
  userId: string;
  localDate: string;
  kg: number;
  loggedAt: Date;
  clientUpdatedAt: Date;
  deletedAt: Date | null;
  updatedAt: Date;
};

export interface WeightsRepository {
  findWeight(id: string): Promise<WeightLogRecord | null>;
  upsertWeight(w: { id: string; userId: string; clientUpdatedAt: Date } & WeightLogData): Promise<void>;
  softDeleteWeight(id: string, clientUpdatedAt: Date): Promise<void>;
  /** Changed since `since` (inclusive), deleted ones included, oldest change first. */
  listChanged(userId: string, since: Date, limit: number): Promise<WeightLogRecord[]>;
}

const select = {
  id: true,
  userId: true,
  localDate: true,
  kg: true,
  loggedAt: true,
  clientUpdatedAt: true,
  deletedAt: true,
  updatedAt: true,
} as const;

export function prismaWeightsRepository(prisma: PrismaClient): WeightsRepository {
  return {
    findWeight: (id) => prisma.weightLog.findUnique({ where: { id }, select }),

    upsertWeight: async ({ id, userId, clientUpdatedAt, loggedAt, ...w }) => {
      const data = { ...w, loggedAt: new Date(loggedAt), clientUpdatedAt, deletedAt: null };
      await prisma.weightLog.upsert({ where: { id }, create: { id, userId, ...data }, update: data });
    },

    softDeleteWeight: async (id, clientUpdatedAt) => {
      await prisma.weightLog.update({ where: { id }, data: { deletedAt: clientUpdatedAt, clientUpdatedAt } });
    },

    listChanged: (userId, since, limit) =>
      prisma.weightLog.findMany({
        where: { userId, updatedAt: { gte: since } },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: limit,
        select,
      }),
  };
}
