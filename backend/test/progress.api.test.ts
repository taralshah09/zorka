// P27–P29 sync entities (weight_log, checkin, phase) and their pull feed, plus the P28 profile setting.
import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { ARJUN, RIYA, testApp } from "./fakes.js";

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

const weight = (over: Record<string, unknown> = {}) => ({
  localDate: "2026-10-11",
  kg: 74.6,
  loggedAt: "2026-10-11T07:30:00.000+05:30",
  ...over,
});

const checkin = (over: Record<string, unknown> = {}) => ({
  phaseId: null,
  checkinDate: "2026-10-11",
  status: "accepted",
  loggedDays: 6,
  previousKcal: 2100,
  newKcal: 1950,
  proteinG: 150,
  carbsG: 190,
  fatG: 55,
  avgIntakeKcal: 2010.5,
  estimatedBurnKcal: 2450.5,
  trendStartKg: 75,
  trendEndKg: 74.6,
  capped: true,
  ...over,
});

const phase = (over: Record<string, unknown> = {}) => ({
  name: "Summer Cut",
  goal: "lose_fat",
  startDate: "2026-08-01",
  endDate: "2026-10-03",
  targetWeightKg: 72,
  kcal: null,
  proteinG: null,
  closedDate: null,
  summary: null,
  ...over,
});

const summary = {
  days: 63,
  weeks: 9,
  startTrendKg: 78.8,
  endTrendKg: 74.6,
  changeKg: -4.2,
  loggedDays: 58,
  avgKcal: 1980,
  avgProteinG: 138,
  workouts: 31,
  prs: 4,
  distanceKm: 42.2,
};

describe("weight_log sync", () => {
  it("stores, updates last-write-wins and deletes a weigh-in", async () => {
    const { app, weights } = testApp();
    const first = op("weight_log", weight());
    expect((await sync(app, RIYA, [first])).body.results[0].status).toBe("applied");
    expect(weights.rows.get(first.id)).toMatchObject({ userId: RIYA, kg: 74.6, localDate: "2026-10-11" });

    const older = op("weight_log", weight({ kg: 99 }), { id: first.id, clientUpdatedAt: "2026-10-11T09:00:00.000Z" });
    expect((await sync(app, RIYA, [older])).body.results[0].status).toBe("stale");
    expect(weights.rows.get(first.id)?.kg).toBe(74.6);

    const del = op("weight_log", undefined, {
      id: first.id,
      action: "delete",
      clientUpdatedAt: "2026-10-11T11:00:00.000Z",
    });
    expect((await sync(app, RIYA, [del])).body.results[0].status).toBe("applied");
    expect(weights.rows.get(first.id)?.deletedAt).toBeInstanceOf(Date);
  });

  it("rejects bad weights and someone else's record", async () => {
    const { app } = testApp();
    const results = (
      await sync(app, RIYA, [
        op("weight_log", weight({ kg: 5 })),
        op("weight_log", weight({ localDate: "11/10/2026" })),
        op("weight_log", { ...weight(), extra: 1 }),
      ])
    ).body.results;
    expect(results.map((r: { status: string }) => r.status)).toEqual(["rejected", "rejected", "rejected"]);

    const mine = op("weight_log", weight());
    await sync(app, RIYA, [mine]);
    const theirs = op("weight_log", weight(), { id: mine.id, clientUpdatedAt: "2026-10-12T00:00:00.000Z" });
    expect((await sync(app, ARJUN, [theirs])).body.results[0]).toMatchObject({ status: "rejected" });
  });
});

describe("checkin sync", () => {
  it("stores accepted, kept and skipped weeks", async () => {
    const { app, checkins } = testApp();
    const ops = [
      op("checkin", checkin()),
      op("checkin", checkin({ status: "kept", checkinDate: "2026-10-04" })),
      op("checkin", {
        ...checkin({ status: "skipped", checkinDate: "2026-09-27", loggedDays: 3, capped: false }),
        newKcal: null,
        proteinG: null,
        carbsG: null,
        fatG: null,
        avgIntakeKcal: null,
        estimatedBurnKcal: null,
        trendStartKg: null,
        trendEndKg: null,
      }),
    ];
    const results = (await sync(app, RIYA, ops)).body.results;
    expect(results.map((r: { status: string }) => r.status)).toEqual(["applied", "applied", "applied"]);
    expect(checkins.rows.get(ops[0]!.id)).toMatchObject({ newKcal: 1950, status: "accepted", userId: RIYA });
  });

  it("needs the offered targets unless the week was skipped", async () => {
    const { app } = testApp();
    const res = await sync(app, RIYA, [
      op("checkin", checkin({ newKcal: null })),
      op("checkin", checkin({ loggedDays: 8 })),
      op("checkin", checkin({ status: "maybe" })),
    ]);
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual(["rejected", "rejected", "rejected"]);
    expect(res.body.results[0].message).toMatch(/offered targets/);
  });
});

describe("phase sync", () => {
  it("creates an active phase, then closes it with a summary", async () => {
    const { app, phases } = testApp();
    const created = op("phase", phase());
    expect((await sync(app, RIYA, [created])).body.results[0].status).toBe("applied");
    expect(phases.rows.get(created.id)).toMatchObject({ name: "Summer Cut", closedDate: null, summary: null });

    const closed = op("phase", phase({ closedDate: "2026-10-02", summary }), {
      id: created.id,
      clientUpdatedAt: "2026-10-11T12:00:00.000Z",
    });
    expect((await sync(app, RIYA, [closed])).body.results[0].status).toBe("applied");
    expect(phases.rows.get(created.id)).toMatchObject({ closedDate: "2026-10-02", summary });
  });

  it("rejects bad dates, names and summaries", async () => {
    const { app } = testApp();
    const res = await sync(app, RIYA, [
      op("phase", phase({ endDate: "2026-07-01" })),
      op("phase", phase({ closedDate: "2026-07-01" })),
      op("phase", phase({ name: "   " })),
      op("phase", phase({ goal: "bulk" })),
      op("phase", phase({ closedDate: "2026-10-02", summary: { ...summary, weeks: 0 } })),
    ]);
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual([
      "rejected",
      "rejected",
      "rejected",
      "rejected",
      "rejected",
    ]);
  });
});

describe("pull", () => {
  it("sends weigh-ins, check-ins and phases back, deleted ones flagged", async () => {
    const { app } = testApp();
    const w = op("weight_log", weight());
    const c = op("checkin", checkin());
    const p = op("phase", phase());
    await sync(app, RIYA, [w, c, p]);
    await sync(app, RIYA, [
      op("weight_log", undefined, { id: w.id, action: "delete", clientUpdatedAt: "2026-10-11T11:00:00.000Z" }),
    ]);

    const res = await request(app).get(`/v1/users/${RIYA}/changes`);
    expect(res.status).toBe(200);
    const byEntity = Object.fromEntries(
      res.body.changes.map((ch: { entity: string; id: string; deleted: boolean; data: unknown }) => [ch.entity, ch]),
    );
    expect(byEntity.weight_log).toMatchObject({ id: w.id, deleted: true, data: { kg: 74.6, localDate: "2026-10-11" } });
    expect(byEntity.checkin).toMatchObject({
      id: c.id,
      deleted: false,
      data: { newKcal: 1950, checkinDate: "2026-10-11" },
    });
    expect(byEntity.phase).toMatchObject({ id: p.id, data: { name: "Summer Cut", summary: null } });
    expect(byEntity.phase.data.clientUpdatedAt).toBe("2026-10-11T10:00:00.000Z");
    expect(byEntity.checkin.data).not.toHaveProperty("userId");

    const other = await request(app).get(`/v1/users/${ARJUN}/changes`);
    expect(other.body.changes).toEqual([]);
  });
});

describe("profile check-in detail setting", () => {
  it("defaults to the simple check-in and can be switched", async () => {
    const { app } = testApp();
    expect((await request(app).get(`/v1/users/${RIYA}/profile`)).body.profile.checkinDetailed).toBe(false);
    const saved = await request(app).put(`/v1/users/${RIYA}/profile`).send({ checkinDetailed: true });
    expect(saved.status).toBe(200);
    expect(saved.body.profile.checkinDetailed).toBe(true);
    expect((await request(app).put(`/v1/users/${RIYA}/profile`).send({ checkinDetailed: "yes" })).status).toBe(422);
  });
});
