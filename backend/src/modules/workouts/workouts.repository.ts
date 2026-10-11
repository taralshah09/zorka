// Persistence for workouts. An upsert replaces the workout's exercises and sets in one transaction.
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { PrKind } from "../../../../shared/domain/gym.js";
import type { WorkoutData, WorkoutDto } from "./workouts.schemas.js";

export type WorkoutRecord = Omit<WorkoutDto, "startedAt" | "endedAt" | "clientUpdatedAt"> & {
  userId: string;
  startedAt: Date;
  endedAt: Date;
  clientUpdatedAt: Date;
  deletedAt: Date | null;
};

export interface WorkoutsRepository {
  userExists(userId: string): Promise<boolean>;
  findWorkout(id: string): Promise<WorkoutRecord | null>;
  upsertWorkout(w: { id: string; userId: string; clientUpdatedAt: Date } & WorkoutData): Promise<void>;
  softDeleteWorkout(id: string, clientUpdatedAt: Date): Promise<void>;
  listRecent(userId: string, limit: number): Promise<WorkoutRecord[]>;
  /** Changed since `since` (inclusive), deleted ones included, oldest change first. */
  listChanged(userId: string, since: Date, limit: number): Promise<(WorkoutRecord & { updatedAt: Date })[]>;
}

const include = {
  exercises: { orderBy: { position: "asc" as const }, include: { sets: { orderBy: { position: "asc" as const } } } },
};

type Row = NonNullable<Awaited<ReturnType<PrismaClient["workout"]["findUnique"]>>> & {
  exercises: (Awaited<ReturnType<PrismaClient["workoutExercise"]["findMany"]>>[number] & {
    sets: Awaited<ReturnType<PrismaClient["workoutSet"]["findMany"]>>;
  })[];
};

const toRecord = (r: Row): WorkoutRecord => ({
  id: r.id,
  userId: r.userId,
  name: r.name,
  startedAt: r.startedAt,
  endedAt: r.endedAt,
  localDate: r.localDate,
  routineId: r.routineId,
  clientUpdatedAt: r.clientUpdatedAt,
  deletedAt: r.deletedAt,
  exercises: r.exercises.map((e) => ({
    id: e.id,
    exerciseId: e.exerciseId,
    name: e.name,
    type: e.type,
    sets: e.sets.map((s) => ({
      id: s.id,
      weightKg: s.weightKg,
      reps: s.reps,
      durationS: s.durationS,
      distanceM: s.distanceM,
      completedAt: s.completedAt?.toISOString() ?? null,
      prKinds: s.prKinds as PrKind[],
    })),
  })),
});

export function prismaWorkoutsRepository(prisma: PrismaClient): WorkoutsRepository {
  return {
    userExists: async (userId) => (await prisma.user.count({ where: { id: userId } })) > 0,

    findWorkout: async (id) => {
      const row = await prisma.workout.findUnique({ where: { id }, include });
      return row ? toRecord(row) : null;
    },

    upsertWorkout: async ({ id, userId, clientUpdatedAt, exercises, startedAt, endedAt, ...w }) => {
      const data = {
        ...w,
        startedAt: new Date(startedAt),
        endedAt: new Date(endedAt),
        clientUpdatedAt,
        deletedAt: null,
      };
      await prisma.$transaction([
        prisma.workout.upsert({ where: { id }, create: { id, userId, ...data }, update: data }),
        // Sets go with their exercise (ON DELETE CASCADE).
        prisma.workoutExercise.deleteMany({ where: { workoutId: id } }),
        prisma.workoutExercise.createMany({
          data: exercises.map(({ sets: _s, ...e }, position) => ({ ...e, workoutId: id, position })),
        }),
        prisma.workoutSet.createMany({
          data: exercises.flatMap((e) =>
            e.sets.map((s, position) => ({
              ...s,
              completedAt: s.completedAt ? new Date(s.completedAt) : null,
              workoutExerciseId: e.id,
              position,
            })),
          ),
        }),
      ]);
    },

    softDeleteWorkout: async (id, clientUpdatedAt) => {
      await prisma.workout.update({ where: { id }, data: { deletedAt: clientUpdatedAt, clientUpdatedAt } });
    },

    listRecent: async (userId, limit) =>
      (
        await prisma.workout.findMany({
          where: { userId, deletedAt: null },
          include,
          orderBy: { startedAt: "desc" },
          take: limit,
        })
      ).map(toRecord),

    listChanged: async (userId, since, limit) =>
      (
        await prisma.workout.findMany({
          where: { userId, updatedAt: { gte: since } },
          include,
          orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
          take: limit,
        })
      ).map((r) => ({ ...toRecord(r), updatedAt: r.updatedAt })),
  };
}
