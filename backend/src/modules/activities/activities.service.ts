// GPS activities: the "activity" sync handler and its change feed.
import type { ChangeFeed } from "../sync/changes.js";
import { lwwGuard, parseOpData, type EntityHandler } from "../sync/lww.js";
import type { ActivitiesRepository, ActivityRecord } from "./activities.repository.js";
import { ActivityData, type ActivityDto } from "./activities.schemas.js";

const toDto = ({
  userId: _u,
  deletedAt: _d,
  updatedAt: _up,
  startedAt,
  endedAt,
  clientUpdatedAt,
  ...a
}: ActivityRecord): ActivityDto => ({
  ...a,
  startedAt: startedAt.toISOString(),
  endedAt: endedAt.toISOString(),
  clientUpdatedAt: clientUpdatedAt.toISOString(),
});

export function activitiesService(repo: ActivitiesRepository) {
  const syncActivity: EntityHandler = async (userId, op) => {
    const existing = await repo.findActivity(op.id);
    const guard = lwwGuard(
      userId,
      op,
      existing ? { ownerId: existing.userId, clientUpdatedAt: existing.clientUpdatedAt } : null,
    );
    if (guard) return guard;

    const at = new Date(op.clientUpdatedAt);
    if (op.action === "delete") {
      if (existing) await repo.softDeleteActivity(op.id, at);
      return { opId: op.opId, status: "applied" };
    }

    const parsed = parseOpData(ActivityData, op);
    if (!parsed.ok) return parsed.result;
    await repo.upsertActivity({ ...parsed.data, id: op.id, userId, clientUpdatedAt: at });
    return { opId: op.opId, status: "applied" };
  };

  const changes: ChangeFeed = async (userId, since, limit) =>
    (await repo.listChanged(userId, since, limit)).map((r) => ({
      id: r.id,
      updatedAt: r.updatedAt,
      deleted: !!r.deletedAt,
      data: toDto(r),
    }));

  return { syncActivity, changes };
}

export type ActivitiesService = ReturnType<typeof activitiesService>;
