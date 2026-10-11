// Routines (P21): the "routine" sync handler and the user's list.
import { notFound } from "../../http/errors.js";
import { lwwGuard, parseOpData, type EntityHandler } from "../sync/lww.js";
import type { RoutineRecord, RoutinesRepository } from "./routines.repository.js";
import { RoutineData, type RoutineDto } from "./routines.schemas.js";

const toDto = ({ userId: _u, deletedAt: _d, clientUpdatedAt, ...r }: RoutineRecord): RoutineDto => ({
  ...r,
  clientUpdatedAt: clientUpdatedAt.toISOString(),
});

export function routinesService(repo: RoutinesRepository, existingExerciseIds: (ids: string[]) => Promise<Set<string>>) {
  const syncRoutine: EntityHandler = async (userId, op) => {
    const existing = await repo.findRoutine(op.id);
    const guard = lwwGuard(
      userId,
      op,
      existing ? { ownerId: existing.userId, clientUpdatedAt: existing.clientUpdatedAt } : null,
    );
    if (guard) return guard;

    const at = new Date(op.clientUpdatedAt);
    if (op.action === "delete") {
      if (existing) await repo.softDeleteRoutine(op.id, at);
      return { opId: op.opId, status: "applied" };
    }

    const parsed = parseOpData(RoutineData, op);
    if (!parsed.ok) return parsed.result;
    const known = await existingExerciseIds(parsed.data.exercises.flatMap((e) => (e.exerciseId ? [e.exerciseId] : [])));
    await repo.upsertRoutine({
      ...parsed.data,
      exercises: parsed.data.exercises.map((e) => ({
        ...e,
        exerciseId: e.exerciseId && known.has(e.exerciseId) ? e.exerciseId : null,
      })),
      id: op.id,
      userId,
      clientUpdatedAt: at,
    });
    return { opId: op.opId, status: "applied" };
  };

  return {
    syncRoutine,

    existingIds: (ids: string[]) => repo.existingIds(ids),

    async list(userId: string): Promise<RoutineDto[]> {
      if (!(await repo.userExists(userId))) throw notFound("User");
      return (await repo.listRoutines(userId)).map(toDto);
    },
  };
}

export type RoutinesService = ReturnType<typeof routinesService>;
