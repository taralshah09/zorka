// Water: the "water_log" sync entity, its pull feed, and the profile's water goal.
import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { ARJUN, RIYA, testApp } from "./fakes.js";

const op = (data: unknown, over: Record<string, unknown> = {}) => ({
  opId: randomUUID(),
  entity: "water_log",
  action: "upsert",
  id: randomUUID(),
  clientUpdatedAt: "2026-10-11T10:00:00.000Z",
  data,
  ...over,
});

const sync = (app: Parameters<typeof request>[0], userId: string, ops: unknown[]) =>
  request(app).post(`/v1/users/${userId}/sync`).send({ ops });

const water = (over: Record<string, unknown> = {}) => ({
  localDate: "2026-10-11",
  glasses: 1,
  loggedAt: "2026-10-11T10:00:00.000+05:30",
  ...over,
});

describe("water_log sync", () => {
  it("stores, updates last-write-wins and deletes a water log", async () => {
    const { app, water: rows } = testApp();
    const first = op(water());
    expect((await sync(app, RIYA, [first])).body.results[0].status).toBe("applied");
    expect(rows.rows.get(first.id)).toMatchObject({ userId: RIYA, glasses: 1, localDate: "2026-10-11" });

    const older = op(water({ glasses: 3 }), { id: first.id, clientUpdatedAt: "2026-10-11T09:00:00.000Z" });
    expect((await sync(app, RIYA, [older])).body.results[0].status).toBe("stale");
    expect(rows.rows.get(first.id)?.glasses).toBe(1);

    const del = op(undefined, { id: first.id, action: "delete", clientUpdatedAt: "2026-10-11T11:00:00.000Z" });
    expect((await sync(app, RIYA, [del])).body.results[0].status).toBe("applied");
    expect(rows.rows.get(first.id)?.deletedAt).toBeInstanceOf(Date);
  });

  it("rejects bad logs and someone else's record", async () => {
    const { app } = testApp();
    const results = (
      await sync(app, RIYA, [
        op(water({ glasses: 0 })),
        op(water({ glasses: 1.5 })),
        op(water({ glasses: 11 })),
        op(water({ localDate: "11/10/2026" })),
        op({ ...water(), extra: 1 }),
      ])
    ).body.results;
    expect(results.map((r: { status: string }) => r.status)).toEqual(Array(5).fill("rejected"));

    const mine = op(water());
    await sync(app, RIYA, [mine]);
    const theirs = op(water(), { id: mine.id, clientUpdatedAt: "2026-10-12T00:00:00.000Z" });
    expect((await sync(app, ARJUN, [theirs])).body.results[0]).toMatchObject({ status: "rejected" });
  });

  it("sends water logs back on pull, only to their owner", async () => {
    const { app } = testApp();
    const w = op(water({ glasses: 2 }));
    await sync(app, RIYA, [w]);
    const res = await request(app).get(`/v1/users/${RIYA}/changes`);
    expect(res.body.changes).toContainEqual({
      entity: "water_log",
      id: w.id,
      deleted: false,
      data: expect.objectContaining({ glasses: 2, localDate: "2026-10-11", clientUpdatedAt: "2026-10-11T10:00:00.000Z" }),
    });
    expect((await request(app).get(`/v1/users/${ARJUN}/changes`)).body.changes).toEqual([]);
  });
});

describe("profile water goal", () => {
  it("defaults to 8 glasses and accepts 1–20", async () => {
    const { app } = testApp();
    expect((await request(app).get(`/v1/users/${RIYA}/profile`)).body.profile.waterGoalGlasses).toBe(8);
    const saved = await request(app).put(`/v1/users/${RIYA}/profile`).send({ waterGoalGlasses: 10 });
    expect(saved.status).toBe(200);
    expect(saved.body.profile.waterGoalGlasses).toBe(10);
    for (const bad of [0, 21, 2.5, "8"]) {
      expect((await request(app).put(`/v1/users/${RIYA}/profile`).send({ waterGoalGlasses: bad })).status).toBe(422);
    }
  });
});
