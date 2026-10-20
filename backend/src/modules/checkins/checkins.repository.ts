// Persistence for weekly check-ins.
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
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
// The report column is Json in Prisma; it was validated (WeekReportData) on the way in.
const asRecord = <T>(r: T) => r as unknown as T extends null ? null : CheckinRecord;

export function prismaCheckinsRepository(prisma: PrismaClient): CheckinsRepository {
  return {
    findCheckin: async (id) => asRecord(await prisma.checkin.findUnique({ where: { id }, omit })),

    upsertCheckin: async ({ id, userId, clientUpdatedAt, report, ...c }) => {
      const data = { ...c, report: report ? (report as Prisma.InputJsonValue) : Prisma.DbNull, clientUpdatedAt, deletedAt: null };
      await prisma.checkin.upsert({ where: { id }, create: { id, userId, ...data }, update: data });
    },

    softDeleteCheckin: async (id, clientUpdatedAt) => {
      await prisma.checkin.update({ where: { id }, data: { deletedAt: clientUpdatedAt, clientUpdatedAt } });
    },

    listChanged: async (userId, since, limit) =>
      (
        await prisma.checkin.findMany({
          where: { userId, updatedAt: { gte: since } },
          orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
          take: limit,
          omit,
        })
      ).map((r) => asRecord(r)),
  };
}
