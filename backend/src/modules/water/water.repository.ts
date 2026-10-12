// Persistence for water logs.
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { WaterLogData } from "./water.schemas.js";

export type WaterLogRecord = {
  id: string;
  userId: string;
  localDate: string;
  glasses: number;
  loggedAt: Date;
  clientUpdatedAt: Date;
  deletedAt: Date | null;
  updatedAt: Date;
};

export interface WaterRepository {
  findWater(id: string): Promise<WaterLogRecord | null>;
  upsertWater(w: { id: string; userId: string; clientUpdatedAt: Date } & WaterLogData): Promise<void>;
  softDeleteWater(id: string, clientUpdatedAt: Date): Promise<void>;
  /** Changed since `since` (inclusive), deleted ones included, oldest change first. */
  listChanged(userId: string, since: Date, limit: number): Promise<WaterLogRecord[]>;
}

const select = {
  id: true,
  userId: true,
  localDate: true,
  glasses: true,
  loggedAt: true,
  clientUpdatedAt: true,
  deletedAt: true,
  updatedAt: true,
} as const;

export function prismaWaterRepository(prisma: PrismaClient): WaterRepository {
  return {
    findWater: (id) => prisma.waterLog.findUnique({ where: { id }, select }),

    upsertWater: async ({ id, userId, clientUpdatedAt, loggedAt, ...w }) => {
      const data = { ...w, loggedAt: new Date(loggedAt), clientUpdatedAt, deletedAt: null };
      await prisma.waterLog.upsert({ where: { id }, create: { id, userId, ...data }, update: data });
    },

    softDeleteWater: async (id, clientUpdatedAt) => {
      await prisma.waterLog.update({ where: { id }, data: { deletedAt: clientUpdatedAt, clientUpdatedAt } });
    },

    listChanged: (userId, since, limit) =>
      prisma.waterLog.findMany({
        where: { userId, updatedAt: { gte: since } },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: limit,
        select,
      }),
  };
}
