// Weigh-ins: the "weight_log" sync handler and its change feed.
import type { ChangeFeed } from "../sync/changes.js";
import { lwwGuard, parseOpData, type EntityHandler } from "../sync/lww.js";
import type { WeightLogRecord, WeightsRepository } from "./weights.repository.js";
import { WeightLogData, type WeightLogDto } from "./weights.schemas.js";

const toDto = (r: WeightLogRecord): WeightLogDto => ({
  id: r.id,
  localDate: r.localDate,
  kg: r.kg,
  loggedAt: r.loggedAt.toISOString(),
  clientUpdatedAt: r.clientUpdatedAt.toISOString(),
});

export function weightsService(repo: WeightsRepository) {
  const syncWeight: EntityHandler = async (userId, op) => {
    const existing = await repo.findWeight(op.id);
    const guard = lwwGuard(
      userId,
      op,
      existing ? { ownerId: existing.userId, clientUpdatedAt: existing.clientUpdatedAt } : null,
    );
    if (guard) return guard;

    const at = new Date(op.clientUpdatedAt);
    if (op.action === "delete") {
      if (existing) await repo.softDeleteWeight(op.id, at);
      return { opId: op.opId, status: "applied" };
    }

    const parsed = parseOpData(WeightLogData, op);
    if (!parsed.ok) return parsed.result;
    await repo.upsertWeight({ ...parsed.data, id: op.id, userId, clientUpdatedAt: at });
    return { opId: op.opId, status: "applied" };
  };

  const changes: ChangeFeed = async (userId, since, limit) =>
    (await repo.listChanged(userId, since, limit)).map((r) => ({
      id: r.id,
      updatedAt: r.updatedAt,
      deleted: !!r.deletedAt,
      data: toDto(r),
    }));

  return { syncWeight, changes };
}

export type WeightsService = ReturnType<typeof weightsService>;
