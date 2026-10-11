// Workouts: the "workout" sync handler (P19) and a recent list.
import { notFound } from "../../http/errors.js";
import { lwwGuard, parseOpData, type EntityHandler } from "../sync/lww.js";
import type { WorkoutRecord, WorkoutsRepository } from "./workouts.repository.js";
import { WorkoutData, type WorkoutDto } from "./workouts.schemas.js";

type ExistingIds = (ids: string[]) => Promise<Set<string>>;

const toDto = ({ userId: _u, deletedAt: _d, startedAt, endedAt, clientUpdatedAt, ...w }: WorkoutRecord): WorkoutDto => ({
  ...w,
  startedAt: startedAt.toISOString(),
  endedAt: endedAt.toISOString(),
  clientUpdatedAt: clientUpdatedAt.toISOString(),
});

/** Unknown exercise or routine ids (e.g. a custom exercise that was rejected) are stored as null rather
 *  than failing the whole workout, like meal items (P12). */
export function workoutsService(repo: WorkoutsRepository, existingExerciseIds: ExistingIds, existingRoutineIds: ExistingIds) {
  const syncWorkout: EntityHandler = async (userId, op) => {
    const existing = await repo.findWorkout(op.id);
    const guard = lwwGuard(
      userId,
      op,
      existing ? { ownerId: existing.userId, clientUpdatedAt: existing.clientUpdatedAt } : null,
    );
    if (guard) return guard;

    const at = new Date(op.clientUpdatedAt);
    if (op.action === "delete") {
      if (existing) await repo.softDeleteWorkout(op.id, at);
      return { opId: op.opId, status: "applied" };
    }

    const parsed = parseOpData(WorkoutData, op);
    if (!parsed.ok) return parsed.result;
    const w = parsed.data;
    const [knownExercises, knownRoutines] = await Promise.all([
      existingExerciseIds(w.exercises.flatMap((e) => (e.exerciseId ? [e.exerciseId] : []))),
      existingRoutineIds(w.routineId ? [w.routineId] : []),
    ]);
    await repo.upsertWorkout({
      ...w,
      routineId: w.routineId && knownRoutines.has(w.routineId) ? w.routineId : null,
      exercises: w.exercises.map((e) => ({
        ...e,
        exerciseId: e.exerciseId && knownExercises.has(e.exerciseId) ? e.exerciseId : null,
      })),
      id: op.id,
      userId,
      clientUpdatedAt: at,
    });
    return { opId: op.opId, status: "applied" };
  };

  return {
    syncWorkout,

    async listRecent(userId: string, limit: number): Promise<WorkoutDto[]> {
      if (!(await repo.userExists(userId))) throw notFound("User");
      return (await repo.listRecent(userId, limit)).map(toDto);
    },
  };
}

export type WorkoutsService = ReturnType<typeof workoutsService>;
