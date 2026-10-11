// Phases: the "phase" sync handler and its change feed.
import type { ChangeFeed } from "../sync/changes.js";
import { lwwGuard, parseOpData, type EntityHandler } from "../sync/lww.js";
import type { PhaseRecord, PhasesRepository } from "./phases.repository.js";
import { PhaseData, type PhaseDto } from "./phases.schemas.js";

const toDto = ({ userId: _u, deletedAt: _d, updatedAt: _up, clientUpdatedAt, ...p }: PhaseRecord): PhaseDto => ({
  ...p,
  clientUpdatedAt: clientUpdatedAt.toISOString(),
});

export function phasesService(repo: PhasesRepository) {
  const syncPhase: EntityHandler = async (userId, op) => {
    const existing = await repo.findPhase(op.id);
    const guard = lwwGuard(
      userId,
      op,
      existing ? { ownerId: existing.userId, clientUpdatedAt: existing.clientUpdatedAt } : null,
    );
    if (guard) return guard;

    const at = new Date(op.clientUpdatedAt);
    if (op.action === "delete") {
      if (existing) await repo.softDeletePhase(op.id, at);
      return { opId: op.opId, status: "applied" };
    }

    const parsed = parseOpData(PhaseData, op);
    if (!parsed.ok) return parsed.result;
    await repo.upsertPhase({ ...parsed.data, id: op.id, userId, clientUpdatedAt: at });
    return { opId: op.opId, status: "applied" };
  };

  const changes: ChangeFeed = async (userId, since, limit) =>
    (await repo.listChanged(userId, since, limit)).map((r) => ({
      id: r.id,
      updatedAt: r.updatedAt,
      deleted: !!r.deletedAt,
      data: toDto(r),
    }));

  return { syncPhase, changes };
}

export type PhasesService = ReturnType<typeof phasesService>;
