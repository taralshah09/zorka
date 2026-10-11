// Exercises: the catalog the phone caches (curated + the user's own, so the picker works offline) and the
// P19 "custom_exercise" sync handler.
import { notFound } from "../../http/errors.js";
import { lwwGuard, parseOpData, type EntityHandler } from "../sync/lww.js";
import type { ExerciseRecord, ExercisesRepository } from "./exercises.repository.js";
import { CustomExerciseData, type ExerciseDto } from "./exercises.schemas.js";

export const toExerciseDto = ({ ownerUserId: _o, clientUpdatedAt: _c, deletedAt: _d, updatedAt, ...e }: ExerciseRecord): ExerciseDto => ({
  ...e,
  updatedAt: updatedAt.toISOString(),
});

export function exercisesService(repo: ExercisesRepository) {
  const syncCustomExercise: EntityHandler = async (userId, op) => {
    const existing = await repo.findExercise(op.id);
    if (existing && !existing.custom) {
      return { opId: op.opId, status: "rejected", message: "Curated exercises can't be changed" };
    }
    const guard = lwwGuard(
      userId,
      op,
      existing ? { ownerId: existing.ownerUserId, clientUpdatedAt: existing.clientUpdatedAt } : null,
    );
    if (guard) return guard;

    const at = new Date(op.clientUpdatedAt);
    if (op.action === "delete") {
      if (existing) await repo.softDeleteCustomExercise(op.id, at);
      return { opId: op.opId, status: "applied" };
    }

    const parsed = parseOpData(CustomExerciseData, op);
    if (!parsed.ok) return parsed.result;
    await repo.upsertCustomExercise({ id: op.id, ownerUserId: userId, ...parsed.data, clientUpdatedAt: at });
    return { opId: op.opId, status: "applied" };
  };

  return {
    async catalog(userId: string): Promise<ExerciseDto[]> {
      if (!(await repo.userExists(userId))) throw notFound("User");
      return (await repo.listCatalog(userId)).map(toExerciseDto);
    },

    /** For the voice parser (P22): curated + the user's exercises, as records. */
    candidates: (userId: string) => repo.listCatalog(userId),

    existingIds: (ids: string[]) => repo.existingIds(ids),

    syncCustomExercise,
  };
}

export type ExercisesService = ReturnType<typeof exercisesService>;
