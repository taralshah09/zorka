import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { ARJUN, RIYA, UNKNOWN, testApp } from "./fakes.js";

const op = (over: Record<string, unknown> = {}) => ({
  opId: randomUUID(),
  entity: "sync_probe",
  action: "upsert",
  id: randomUUID(),
  clientUpdatedAt: "2026-10-11T10:00:00.000Z",
  data: { note: "made offline" },
  ...over,
});

describe("POST /v1/users/:id/sync", () => {
  it("applies an upsert and the record becomes visible", async () => {
    const { app } = testApp();
    const o = op();
    const res = await request(app).post(`/v1/users/${RIYA}/sync`).send({ ops: [o] });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([{ opId: o.opId, status: "applied" }]);

    const list = await request(app).get(`/v1/users/${RIYA}/sync-probes`);
    expect(list.body.probes).toEqual([{ id: o.id, note: "made offline", clientUpdatedAt: o.clientUpdatedAt }]);
  });

  it("is idempotent: replaying the same op doesn't duplicate", async () => {
    const { app, sync } = testApp();
    const o = op();
    await request(app).post(`/v1/users/${RIYA}/sync`).send({ ops: [o] });
    const again = await request(app).post(`/v1/users/${RIYA}/sync`).send({ ops: [o] });
    expect(again.body.results[0].status).toBe("applied");
    expect(sync.probes.size).toBe(1);
  });

  it("last write wins: an older write is reported stale and ignored", async () => {
    const { app, sync } = testApp();
    const id = randomUUID();
    await request(app)
      .post(`/v1/users/${RIYA}/sync`)
      .send({ ops: [op({ id, clientUpdatedAt: "2026-10-11T12:00:00.000Z", data: { note: "newer" } })] });
    const res = await request(app)
      .post(`/v1/users/${RIYA}/sync`)
      .send({ ops: [op({ id, clientUpdatedAt: "2026-10-11T11:00:00.000Z", data: { note: "older" } })] });
    expect(res.body.results[0].status).toBe("stale");
    expect(sync.probes.get(id)?.note).toBe("newer");
  });

  it("soft-deletes with a newer delete op", async () => {
    const { app } = testApp();
    const id = randomUUID();
    await request(app).post(`/v1/users/${RIYA}/sync`).send({ ops: [op({ id })] });
    const del = await request(app)
      .post(`/v1/users/${RIYA}/sync`)
      .send({ ops: [op({ id, action: "delete", data: undefined, clientUpdatedAt: "2026-10-11T10:05:00.000Z" })] });
    expect(del.body.results[0].status).toBe("applied");
    const list = await request(app).get(`/v1/users/${RIYA}/sync-probes`);
    expect(list.body.probes).toEqual([]);
  });

  it("rejects a bad payload without blocking the rest of the batch", async () => {
    const { app } = testApp();
    const bad = op({ data: { note: "" } });
    const good = op();
    const res = await request(app).post(`/v1/users/${RIYA}/sync`).send({ ops: [bad, good] });
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual(["rejected", "applied"]);
  });

  it("never lets one user overwrite another user's record", async () => {
    const { app } = testApp();
    const id = randomUUID();
    await request(app).post(`/v1/users/${RIYA}/sync`).send({ ops: [op({ id })] });
    const res = await request(app)
      .post(`/v1/users/${ARJUN}/sync`)
      .send({ ops: [op({ id, clientUpdatedAt: "2026-10-12T00:00:00.000Z" })] });
    expect(res.body.results[0].status).toBe("rejected");
  });

  it("validates the envelope and the user", async () => {
    const { app } = testApp();
    expect((await request(app).post(`/v1/users/${RIYA}/sync`).send({ ops: [] })).status).toBe(422);
    expect((await request(app).post(`/v1/users/${RIYA}/sync`).send({ ops: [op({ entity: "meal" })] })).status).toBe(422);
    expect((await request(app).post(`/v1/users/${UNKNOWN}/sync`).send({ ops: [op()] })).status).toBe(404);
  });
});
