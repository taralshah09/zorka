// Persistence for routines. An upsert replaces the routine's exercise list in one transaction.
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { RoutineData, RoutineDto } from "./routines.schemas.js";

export type RoutineRecord = Omit<RoutineDto, "clientUpdatedAt"> & {
  userId: string;
  clientUpdatedAt: Date;
  deletedAt: Date | null;
};

export interface RoutinesRepository {
  userExists(userId: string): Promise<boolean>;
  findRoutine(id: string): Promise<RoutineRecord | null>;
  upsertRoutine(r: { id: string; userId: string; clientUpdatedAt: Date } & RoutineData): Promise<void>;
  softDeleteRoutine(id: string, clientUpdatedAt: Date): Promise<void>;
  listRoutines(userId: string): Promise<RoutineRecord[]>;
  /** Changed since `since` (inclusive), deleted ones included, oldest change first. */
  listChanged(userId: string, since: Date, limit: number): Promise<(RoutineRecord & { updatedAt: Date })[]>;
  /** Ids from `ids` that exist (deleted or not). Keeps workout → routine links valid. */
  existingIds(ids: string[]): Promise<Set<string>>;
}

const include = { exercises: { orderBy: { position: "asc" as const } } };

type Row = NonNullable<Awaited<ReturnType<PrismaClient["routine"]["findUnique"]>>> & {
  exercises: Awaited<ReturnType<PrismaClient["routineExercise"]["findMany"]>>;
};

const toRecord = (r: Row): RoutineRecord => ({
  id: r.id,
  userId: r.userId,
  name: r.name,
  clientUpdatedAt: r.clientUpdatedAt,
  deletedAt: r.deletedAt,
  exercises: r.exercises.map((e) => ({
    id: e.id,
    exerciseId: e.exerciseId,
    name: e.name,
    type: e.type,
    targetSets: e.targetSets,
    targetReps: e.targetReps,
  })),
});

export function prismaRoutinesRepository(prisma: PrismaClient): RoutinesRepository {
  return {
    userExists: async (userId) => (await prisma.user.count({ where: { id: userId } })) > 0,

    findRoutine: async (id) => {
      const row = await prisma.routine.findUnique({ where: { id }, include });
      return row ? toRecord(row) : null;
    },

    upsertRoutine: async ({ id, userId, clientUpdatedAt, exercises, name }) => {
      const data = { name, clientUpdatedAt, deletedAt: null };
      await prisma.$transaction([
        prisma.routine.upsert({ where: { id }, create: { id, userId, ...data }, update: data }),
        prisma.routineExercise.deleteMany({ where: { routineId: id } }),
        prisma.routineExercise.createMany({
          data: exercises.map((e, position) => ({ ...e, routineId: id, position })),
        }),
      ]);
    },

    softDeleteRoutine: async (id, clientUpdatedAt) => {
      await prisma.routine.update({ where: { id }, data: { deletedAt: clientUpdatedAt, clientUpdatedAt } });
    },

    listRoutines: async (userId) =>
      (
        await prisma.routine.findMany({ where: { userId, deletedAt: null }, include, orderBy: { name: "asc" } })
      ).map(toRecord),

    listChanged: async (userId, since, limit) =>
      (
        await prisma.routine.findMany({
          where: { userId, updatedAt: { gte: since } },
          include,
          orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
          take: limit,
        })
      ).map((r) => ({ ...toRecord(r), updatedAt: r.updatedAt })),

    existingIds: async (ids) => {
      if (!ids.length) return new Set();
      const rows = await prisma.routine.findMany({ where: { id: { in: ids } }, select: { id: true } });
      return new Set(rows.map((r) => r.id));
    },
  };
}
