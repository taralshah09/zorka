// GPS activity sync and GET /v1/users/:id/changes — the pull a phone uses to restore and stay in step.
import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { curatedExerciseId } from "../src/modules/exercises/catalog.js";
import { ARJUN, RIYA, UNKNOWN, testApp } from "./fakes.js";

const op = (entity: string, data: unknown, over: Record<string, unknown> = {}) => ({
  opId: randomUUID(),
  entity,
  action: "upsert",
  id: randomUUID(),
  clientUpdatedAt: "2026-10-11T10:00:00.000Z",
  data,
  ...over,
});

const sync = (app: Parameters<typeof request>[0], userId: string, ops: unknown[]) =>
  request(app).post(`/v1/users/${userId}/sync`).send({ ops });

const changes = (app: Parameters<typeof request>[0], userId: string, since?: string) =>
  request(app).get(`/v1/users/${userId}/changes${since ? `?since=${encodeURIComponent(since)}` : ""}`);

const meal = () => ({
  mealType: "lunch",
  loggedAt: "2026-10-11T13:00:00.000+05:30",
  localDate: "2026-10-11",
  source: "search",
  items: [
    { id: randomUUID(), foodId: null, name: "Dal", quantity: 1, unit: "katori", grams: 150, kcal: 180, proteinG: 9, carbsG: 24, fatG: 5 },
  ],
});

const activity = (over: Record<string, unknown> = {}) => ({
  kind: "run",
  weightKg: 70,
  startedAt: "2026-10-11T06:00:00.000Z",
  endedAt: "2026-10-11T06:30:00.000Z",
  localDate: "2026-10-11",
  elapsedMs: 1_800_000,
  points: [
    [19.076, 72.8777, 1_791_000_000_000, 5, 1, 0],
    [19.077, 72.8787, 1_791_000_005_000, 6, 1, 5000],
  ],
  ...over,
});

const routine = () => ({
  name: "Legs",
  exercises: [
    { id: randomUUID(), exerciseId: curatedExerciseId("plank"), name: "Plank", type: "time", targetSets: 3 },
  ],
});

describe("activity sync", () => {
  it("stores a finished activity with its route", async () => {
    const { app, activities } = testApp();
    const a = op("activity", activity());
    expect((await sync(app, RIYA, [a])).body.results[0].status).toBe("applied");
    expect(activities.rows.get(a.id)?.points).toHaveLength(2);
  });

  it("rejects a bad route point and an activity that ends before it starts", async () => {
    const { app } = testApp();
    const res = await sync(app, RIYA, [
      op("activity", activity({ points: [[200, 0, 1, 1, 0, 0]] })),
      op("activity", activity({ endedAt: "2026-10-11T05:00:00.000Z" })),
    ]);
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual(["rejected", "rejected"]);
  });

  it("never lets another user overwrite it", async () => {
    const { app } = testApp();
    const a = op("activity", activity());
    await sync(app, RIYA, [a]);
    const res = await sync(app, ARJUN, [op("activity", activity(), { id: a.id, clientUpdatedAt: "2026-10-12T00:00:00.000Z" })]);
    expect(res.body.results[0].status).toBe("rejected");
  });
});

describe("GET /v1/users/:id/changes", () => {
  it("returns everything the user has, across entities, from the start", async () => {
    const { app } = testApp();
    const m = op("meal_log", meal());
    const a = op("activity", activity());
    const r = op("routine", routine());
    await sync(app, RIYA, [m, a, r]);
    await sync(app, ARJUN, [op("meal_log", meal())]);

    const res = await changes(app, RIYA);
    expect(res.status).toBe(200);
    expect(res.body.more).toBe(false);
    const got = res.body.changes.map((c: { entity: string; id: string }) => `${c.entity}:${c.id}`).sort();
    expect(got).toEqual([`activity:${a.id}`, `meal_log:${m.id}`, `routine:${r.id}`].sort());
    const mc = res.body.changes.find((c: { id: string }) => c.id === m.id);
    expect(mc.deleted).toBe(false);
    expect(mc.data.items[0].name).toBe("Dal");
  });

  it("includes deletions and only what changed since the cursor", async () => {
    const { app } = testApp();
    const m = op("meal_log", meal());
    await sync(app, RIYA, [m]);
    const first = await changes(app, RIYA);

    const later = op("meal_log", meal());
    await sync(app, RIYA, [
      later,
      { ...op("meal_log", null), id: m.id, action: "delete", data: undefined, clientUpdatedAt: "2026-10-11T11:00:00.000Z" },
    ]);
    const next = await changes(app, RIYA, first.body.cursor);
    const byId = new Map(next.body.changes.map((c: { id: string; deleted: boolean }) => [c.id, c.deleted]));
    expect(byId.get(m.id)).toBe(true);
    expect(byId.get(later.id)).toBe(false);
  });

  it("pages large histories and the cursor walks through all of them", async () => {
    const { app } = testApp();
    const ids = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const batch = Array.from({ length: 10 }, () => op("activity", activity()));
      batch.forEach((b) => ids.add(b.id));
      await sync(app, RIYA, batch);
    }
    const seen = new Set<string>();
    let since: string | undefined;
    for (let page = 0; page < 10; page++) {
      const res = await changes(app, RIYA, since);
      res.body.changes.forEach((c: { id: string }) => seen.add(c.id));
      since = res.body.cursor;
      if (!res.body.more) break;
    }
    expect(seen).toEqual(ids);
  });

  it("404s for an unknown user and 422s for a bad cursor", async () => {
    const { app } = testApp();
    expect((await changes(app, UNKNOWN)).status).toBe(404);
    expect((await changes(app, RIYA, "yesterday")).status).toBe(422);
  });
});
