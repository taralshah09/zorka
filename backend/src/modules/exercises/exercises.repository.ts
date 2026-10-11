// Persistence for exercises. The curated list is shared; user-created exercises are visible only to their
// owner and are soft-deleted.
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { ExerciseDto } from "./exercises.schemas.js";

export type ExerciseRecord = Omit<ExerciseDto, "updatedAt"> & {
  ownerUserId: string | null;
  clientUpdatedAt: Date | null;
  deletedAt: Date | null;
  updatedAt: Date;
};

export type CustomExerciseWrite = {
  id: string;
  ownerUserId: string;
  name: string;
  category: ExerciseDto["category"];
  type: ExerciseDto["type"];
  referenceUrl: string | null;
  clientUpdatedAt: Date;
};

export interface ExercisesRepository {
  userExists(userId: string): Promise<boolean>;
  /** Curated exercises plus the user's own (not deleted). */
  listCatalog(userId: string): Promise<ExerciseRecord[]>;
  findExercise(id: string): Promise<ExerciseRecord | null>;
  /** Ids from `ids` that exist (deleted or not). Keeps workout/routine links valid. */
  existingIds(ids: string[]): Promise<Set<string>>;
  upsertCustomExercise(e: CustomExerciseWrite): Promise<void>;
  softDeleteCustomExercise(id: string, clientUpdatedAt: Date): Promise<void>;
}

type Row = NonNullable<Awaited<ReturnType<PrismaClient["exercise"]["findUnique"]>>>;

const toRecord = (r: Row): ExerciseRecord => ({
  id: r.id,
  name: r.name,
  aliases: r.aliases,
  category: r.category,
  type: r.type,
  referenceUrl: r.referenceUrl,
  source: r.source,
  custom: r.ownerUserId !== null,
  ownerUserId: r.ownerUserId,
  clientUpdatedAt: r.clientUpdatedAt,
  deletedAt: r.deletedAt,
  updatedAt: r.updatedAt,
});

export function prismaExercisesRepository(prisma: PrismaClient): ExercisesRepository {
  return {
    userExists: async (userId) => (await prisma.user.count({ where: { id: userId } })) > 0,

    listCatalog: async (userId) =>
      (
        await prisma.exercise.findMany({
          where: { deletedAt: null, OR: [{ ownerUserId: null }, { ownerUserId: userId }] },
          orderBy: { name: "asc" },
        })
      ).map(toRecord),

    findExercise: async (id) => {
      const row = await prisma.exercise.findUnique({ where: { id } });
      return row ? toRecord(row) : null;
    },

    existingIds: async (ids) => {
      if (!ids.length) return new Set();
      const rows = await prisma.exercise.findMany({ where: { id: { in: ids } }, select: { id: true } });
      return new Set(rows.map((r) => r.id));
    },

    upsertCustomExercise: async (e) => {
      const data = {
        name: e.name,
        category: e.category,
        type: e.type,
        referenceUrl: e.referenceUrl,
        clientUpdatedAt: e.clientUpdatedAt,
        deletedAt: null,
      };
      await prisma.exercise.upsert({
        where: { id: e.id },
        create: { id: e.id, slug: `user-${e.id}`, ownerUserId: e.ownerUserId, source: "user", ...data },
        update: data,
      });
    },

    softDeleteCustomExercise: async (id, clientUpdatedAt) => {
      await prisma.exercise.update({ where: { id }, data: { deletedAt: clientUpdatedAt, clientUpdatedAt } });
    },
  };
}
