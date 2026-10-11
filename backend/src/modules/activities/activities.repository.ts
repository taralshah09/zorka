// Persistence for GPS activities. The route is stored as one JSON column.
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { ActivityData, ActivityDto, ActivityPoint } from "./activities.schemas.js";

export type ActivityRecord = Omit<ActivityDto, "startedAt" | "endedAt" | "clientUpdatedAt"> & {
  userId: string;
  startedAt: Date;
  endedAt: Date;
  clientUpdatedAt: Date;
  deletedAt: Date | null;
  updatedAt: Date;
};

export interface ActivitiesRepository {
  findActivity(id: string): Promise<ActivityRecord | null>;
  upsertActivity(a: { id: string; userId: string; clientUpdatedAt: Date } & ActivityData): Promise<void>;
  softDeleteActivity(id: string, clientUpdatedAt: Date): Promise<void>;
  /** Changed since `since` (inclusive), deleted ones included, oldest change first. */
  listChanged(userId: string, since: Date, limit: number): Promise<ActivityRecord[]>;
}

type Row = NonNullable<Awaited<ReturnType<PrismaClient["activity"]["findUnique"]>>>;

const toRecord = (r: Row): ActivityRecord => ({
  id: r.id,
  userId: r.userId,
  kind: r.kind,
  weightKg: r.weightKg,
  startedAt: r.startedAt,
  endedAt: r.endedAt,
  localDate: r.localDate,
  elapsedMs: r.elapsedMs,
  points: r.points as ActivityPoint[],
  clientUpdatedAt: r.clientUpdatedAt,
  deletedAt: r.deletedAt,
  updatedAt: r.updatedAt,
});

export function prismaActivitiesRepository(prisma: PrismaClient): ActivitiesRepository {
  return {
    findActivity: async (id) => {
      const row = await prisma.activity.findUnique({ where: { id } });
      return row ? toRecord(row) : null;
    },

    upsertActivity: async ({ id, userId, clientUpdatedAt, startedAt, endedAt, ...a }) => {
      const data = { ...a, startedAt: new Date(startedAt), endedAt: new Date(endedAt), clientUpdatedAt, deletedAt: null };
      await prisma.activity.upsert({ where: { id }, create: { id, userId, ...data }, update: data });
    },

    softDeleteActivity: async (id, clientUpdatedAt) => {
      await prisma.activity.update({ where: { id }, data: { deletedAt: clientUpdatedAt, clientUpdatedAt } });
    },

    listChanged: async (userId, since, limit) =>
      (
        await prisma.activity.findMany({
          where: { userId, updatedAt: { gte: since } },
          orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
          take: limit,
        })
      ).map(toRecord),
  };
}
