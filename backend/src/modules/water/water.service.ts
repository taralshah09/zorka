// Water logs: the "water_log" sync handler and its change feed.
import type { ChangeFeed } from "../sync/changes.js";
import { lwwGuard, parseOpData, type EntityHandler } from "../sync/lww.js";
import type { WaterLogRecord, WaterRepository } from "./water.repository.js";
import { WaterLogData, type WaterLogDto } from "./water.schemas.js";

const toDto = (r: WaterLogRecord): WaterLogDto => ({
  id: r.id,
  localDate: r.localDate,
  glasses: r.glasses,
  loggedAt: r.loggedAt.toISOString(),
  clientUpdatedAt: r.clientUpdatedAt.toISOString(),
});

export function waterService(repo: WaterRepository) {
  const syncWater: EntityHandler = async (userId, op) => {
    const existing = await repo.findWater(op.id);
    const guard = lwwGuard(
      userId,
      op,
      existing ? { ownerId: existing.userId, clientUpdatedAt: existing.clientUpdatedAt } : null,
    );
    if (guard) return guard;

    const at = new Date(op.clientUpdatedAt);
    if (op.action === "delete") {
      if (existing) await repo.softDeleteWater(op.id, at);
      return { opId: op.opId, status: "applied" };
    }

    const parsed = parseOpData(WaterLogData, op);
    if (!parsed.ok) return parsed.result;
    await repo.upsertWater({ ...parsed.data, id: op.id, userId, clientUpdatedAt: at });
    return { opId: op.opId, status: "applied" };
  };

  const changes: ChangeFeed = async (userId, since, limit) =>
    (await repo.listChanged(userId, since, limit)).map((r) => ({
      id: r.id,
      updatedAt: r.updatedAt,
      deleted: !!r.deletedAt,
      data: toDto(r),
    }));

  return { syncWater, changes };
}

export type WaterService = ReturnType<typeof waterService>;
