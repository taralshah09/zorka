// Weekly check-ins: the "checkin" sync handler and its change feed.
import type { ChangeFeed } from "../sync/changes.js";
import { lwwGuard, parseOpData, type EntityHandler } from "../sync/lww.js";
import type { CheckinRecord, CheckinsRepository } from "./checkins.repository.js";
import { CheckinData, type CheckinDto } from "./checkins.schemas.js";

const toDto = ({ userId: _u, deletedAt: _d, updatedAt: _up, clientUpdatedAt, ...c }: CheckinRecord): CheckinDto => ({
  ...c,
  clientUpdatedAt: clientUpdatedAt.toISOString(),
});

export function checkinsService(repo: CheckinsRepository) {
  const syncCheckin: EntityHandler = async (userId, op) => {
    const existing = await repo.findCheckin(op.id);
    const guard = lwwGuard(
      userId,
      op,
      existing ? { ownerId: existing.userId, clientUpdatedAt: existing.clientUpdatedAt } : null,
    );
    if (guard) return guard;

    const at = new Date(op.clientUpdatedAt);
    if (op.action === "delete") {
      if (existing) await repo.softDeleteCheckin(op.id, at);
      return { opId: op.opId, status: "applied" };
    }

    const parsed = parseOpData(CheckinData, op);
    if (!parsed.ok) return parsed.result;
    await repo.upsertCheckin({ ...parsed.data, id: op.id, userId, clientUpdatedAt: at });
    return { opId: op.opId, status: "applied" };
  };

  const changes: ChangeFeed = async (userId, since, limit) =>
    (await repo.listChanged(userId, since, limit)).map((r) => ({
      id: r.id,
      updatedAt: r.updatedAt,
      deleted: !!r.deletedAt,
      data: toDto(r),
    }));

  return { syncCheckin, changes };
}

export type CheckinsService = ReturnType<typeof checkinsService>;
