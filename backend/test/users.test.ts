import request from "supertest";
import { describe, expect, it } from "vitest";

import { RIYA, UNKNOWN, testApp } from "./fakes.js";

describe("GET /v1/users", () => {
  it("lists the dummy users with their onboarding state", async () => {
    const res = await request(testApp().app).get("/v1/users");
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([
      { id: RIYA, displayName: "Riya", onboarded: false },
      expect.objectContaining({ displayName: "Arjun", onboarded: false }),
    ]);
  });
});

describe("GET /v1/users/:id/profile", () => {
  it("returns an empty profile for a user who hasn't onboarded", async () => {
    const res = await request(testApp().app).get(`/v1/users/${RIYA}/profile`);
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ userId: RIYA, displayName: "Riya", goal: null, onboardedAt: null });
  });

  it("404s for an unknown user", async () => {
    const res = await request(testApp().app).get(`/v1/users/${UNKNOWN}/profile`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("422s for a non-uuid id", async () => {
    const res = await request(testApp().app).get(`/v1/users/riya/profile`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("PUT /v1/users/:id/profile", () => {
  it("saves a partial update and returns the merged profile", async () => {
    const { app } = testApp();
    const res = await request(app)
      .put(`/v1/users/${RIYA}/profile`)
      .send({ goal: "lose_fat", age: 29, heightCm: 162, weightKg: 68.5, diet: "veg" });
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ goal: "lose_fat", age: 29, heightCm: 162, weightKg: 68.5, diet: "veg" });

    const second = await request(app).put(`/v1/users/${RIYA}/profile`).send({ coach: "calm_mentor" });
    expect(second.body.profile).toMatchObject({ goal: "lose_fat", coach: "calm_mentor" });

    const read = await request(app).get(`/v1/users/${RIYA}/profile`);
    expect(read.body.profile).toMatchObject({ goal: "lose_fat", coach: "calm_mentor", diet: "veg" });
  });

  it("marks onboarding complete and reflects it in the user list", async () => {
    const { app } = testApp();
    await request(app).put(`/v1/users/${RIYA}/profile`).send({ onboardedAt: "2026-10-11T08:00:00.000Z" });
    const list = await request(app).get("/v1/users");
    expect(list.body.users[0]).toMatchObject({ id: RIYA, onboarded: true });
  });

  it("rejects out-of-range values and unknown fields", async () => {
    const { app } = testApp();
    const bad = await request(app).put(`/v1/users/${RIYA}/profile`).send({ age: 7, diet: "keto" });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual(["age", "diet"]);

    const extra = await request(app).put(`/v1/users/${RIYA}/profile`).send({ displayName: "Hacker" });
    expect(extra.status).toBe(422);
  });

  it("defaults the step goal to 8,000 and accepts 2,000–100,000 whole steps (D48, UX F13)", async () => {
    const { app } = testApp();
    const fresh = await request(app).get(`/v1/users/${RIYA}/profile`);
    expect(fresh.body.profile.stepGoal).toBe(8000);

    const saved = await request(app).put(`/v1/users/${RIYA}/profile`).send({ stepGoal: 12_500 });
    expect(saved.status).toBe(200);
    expect(saved.body.profile.stepGoal).toBe(12_500);

    for (const stepGoal of [1999, 100_001, 9000.5]) {
      const bad = await request(app).put(`/v1/users/${RIYA}/profile`).send({ stepGoal });
      expect(bad.status).toBe(422);
    }
    const max = await request(app).put(`/v1/users/${RIYA}/profile`).send({ stepGoal: 100_000 });
    expect(max.body.profile.stepGoal).toBe(100_000);
  });

  it("404s for an unknown user", async () => {
    const res = await request(testApp().app).put(`/v1/users/${UNKNOWN}/profile`).send({ age: 30 });
    expect(res.status).toBe(404);
  });
});
