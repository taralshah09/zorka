// Persistence for weekly check-ins.
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { CheckinData } from "./checkins.schemas.js";

export type CheckinRecord = CheckinData & {
  id: string;
  userId: string;
  clientUpdatedAt: Date;
  deletedAt: Date | null;
  updatedAt: Date;
};

export interface CheckinsRepository {
  findCheckin(id: string): Promise<CheckinRecord | null>;
  upsertCheckin(c: { id: string; userId: string; clientUpdatedAt: Date } & CheckinData): Promise<void>;
  softDeleteCheckin(id: string, clientUpdatedAt: Date): Promise<void>;
  /** Changed since `since` (inclusive), deleted ones included, oldest change first. */
  listChanged(userId: string, since: Date, limit: number): Promise<CheckinRecord[]>;
}

const omit = { createdAt: true } as const;

export function prismaCheckinsRepository(prisma: PrismaClient): CheckinsRepository {
  return {
    findCheckin: (id) => prisma.checkin.findUnique({ where: { id }, omit }),

    upsertCheckin: async ({ id, userId, clientUpdatedAt, ...c }) => {
      const data = { ...c, clientUpdatedAt, deletedAt: null };
      await prisma.checkin.upsert({ where: { id }, create: { id, userId, ...data }, update: data });
    },

    softDeleteCheckin: async (id, clientUpdatedAt) => {
      await prisma.checkin.update({ where: { id }, data: { deletedAt: clientUpdatedAt, clientUpdatedAt } });
    },

    listChanged: (userId, since, limit) =>
      prisma.checkin.findMany({
        where: { userId, updatedAt: { gte: since } },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: limit,
        omit,
      }),
  };
}
