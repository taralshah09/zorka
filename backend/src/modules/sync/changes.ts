// GET /v1/users/:id/changes?since= — every record of the user's that changed on the server since a cursor,
// deleted ones included. The phone uses it to rebuild its local copy (new phone, reinstall) and to pick up
// changes made elsewhere. Each entity module supplies a feed; this pages them together under one cursor.
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { notFound } from "../../http/errors.js";
import { parse } from "../../http/validate.js";
import { UserIdParams } from "../users/users.schemas.js";

export type Change = { id: string; updatedAt: Date; deleted: boolean; data: unknown };
/** Records changed at or after `since`, oldest change first, at most `limit`. */
export type ChangeFeed = (userId: string, since: Date, limit: number) => Promise<Change[]>;

export const PULL_ENTITIES = ["meal_log", "workout", "routine", "activity"] as const;
export type PullEntity = (typeof PULL_ENTITIES)[number];

/** Page size per entity. Activities carry their whole route, so fewer per page. */
const PAGE: Record<PullEntity, number> = { meal_log: 200, workout: 100, routine: 100, activity: 20 };

export type ChangesPage = {
  changes: { entity: PullEntity; id: string; deleted: boolean; data: unknown }[];
  /** Pass back as `since`. Inclusive, so records at the cursor come again; applying them twice is harmless. */
  cursor: string;
  /** More changes are waiting: ask again with `cursor`. */
  more: boolean;
};

export function changesService(userExists: (userId: string) => Promise<boolean>, feeds: Record<PullEntity, ChangeFeed>) {
  return {
    async list(userId: string, since: Date): Promise<ChangesPage> {
      if (!(await userExists(userId))) throw notFound("User");
      const pages = await Promise.all(
        PULL_ENTITIES.map(async (entity) => ({ entity, rows: await feeds[entity](userId, since, PAGE[entity]) })),
      );
      // A full page may have more behind it, so every entity stops at the earliest point a full page reached.
      const full = pages.filter((p) => p.rows.length >= PAGE[p.entity]);
      const cutoff = full.length ? Math.min(...full.map((p) => p.rows.at(-1)!.updatedAt.getTime())) : null;
      const rows = pages
        .flatMap((p) => p.rows.map((r) => ({ ...r, entity: p.entity })))
        .filter((r) => cutoff === null || r.updatedAt.getTime() <= cutoff)
        .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
      const latest = cutoff ?? Math.max(since.getTime(), ...rows.map((r) => r.updatedAt.getTime()));
      return {
        changes: rows.map(({ entity, id, deleted, data }) => ({ entity, id, deleted, data })),
        cursor: new Date(latest).toISOString(),
        more: full.length > 0,
      };
    },
  };
}

export type ChangesService = ReturnType<typeof changesService>;

const ChangesQuery = z.object({ since: z.string().datetime({ offset: true }).optional() });

export function changesRoutes(service: ChangesService): Router {
  return Router().get("/users/:id/changes", async (req: Request, res: Response) => {
    const { id } = parse(UserIdParams, req.params);
    const { since } = parse(ChangesQuery, req.query);
    res.json(await service.list(id, new Date(since ?? 0)));
  });
}
