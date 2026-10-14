// Rate limits: general per-user and per-IP limits on every route, tighter AI and AI + search buckets.
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { errorHandler } from "../src/http/errors.js";
import { memoryRateLimitStore, rateLimit, type RateLimitConfig, type RateLimitStore } from "../src/http/rateLimit.js";
import { ARJUN, RIYA, testApp } from "./fakes.js";

const LOOSE: RateLimitConfig = {
  general: { perMinutePerUser: 1000, perMinutePerIp: 1000 },
  ai: { perMinute: 1000, perDay: 1000 },
  search: { perMinute: 1000, perDay: 1000 },
};

const limitedApp = (config: Partial<RateLimitConfig>) =>
  testApp({ rateLimit: { config: { ...LOOSE, ...config }, store: memoryRateLimitStore() } }).app;

/** A bare app with a controllable clock, for window tests. */
function clockApp(config: Partial<RateLimitConfig>) {
  let t = Date.UTC(2026, 9, 15, 10, 0, 0);
  const app = express();
  app.use(rateLimit({ ...LOOSE, ...config }, memoryRateLimitStore(), () => t));
  app.all("/{*any}", (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return { app, advance: (ms: number) => (t += ms) };
}

describe("general limits", () => {
  it("returns 429 RATE_LIMITED with Retry-After once a user is over the per-minute limit", async () => {
    const app = limitedApp({ general: { perMinutePerUser: 2, perMinutePerIp: 1000 } });
    for (let i = 0; i < 2; i++) expect((await request(app).get(`/v1/users/${RIYA}/profile`)).status).not.toBe(429);
    const res = await request(app).get(`/v1/users/${RIYA}/profile`);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(res.body.error.message).toMatch(/^Too many requests\. Try again in \d+ s\.$/);
    expect(res.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(Number(res.headers["retry-after"])).toBe(res.body.error.details.retryAfterSeconds);
  });

  it("counts each user id separately", async () => {
    const app = limitedApp({ general: { perMinutePerUser: 1, perMinutePerIp: 1000 } });
    await request(app).get(`/v1/users/${RIYA}/profile`);
    expect((await request(app).get(`/v1/users/${RIYA}/profile`)).status).toBe(429);
    expect((await request(app).get(`/v1/users/${ARJUN}/profile`)).status).not.toBe(429);
  });

  it("the per-IP ceiling can't be dodged by switching user ids", async () => {
    const app = limitedApp({ general: { perMinutePerUser: 1000, perMinutePerIp: 2 } });
    await request(app).get(`/v1/users/${RIYA}/profile`);
    await request(app).get(`/v1/users/${ARJUN}/profile`);
    expect((await request(app).get(`/v1/users/00000000-0000-4000-8000-000000000000/profile`)).status).toBe(429);
  });

  it("routes without a user id are limited per IP", async () => {
    const app = limitedApp({ general: { perMinutePerUser: 1000, perMinutePerIp: 1 } });
    await request(app).get("/v1/foods?q=roti");
    expect((await request(app).get("/v1/users")).status).toBe(429);
  });

  it("never limits the health check or the root", async () => {
    const app = limitedApp({ general: { perMinutePerUser: 1, perMinutePerIp: 1 } });
    for (let i = 0; i < 3; i++) {
      expect((await request(app).get("/v1/health")).status).toBe(200);
      expect((await request(app).get("/")).status).toBe(200);
    }
  });

  it("is off when no rate limit config is given", async () => {
    const { app } = testApp();
    for (let i = 0; i < 5; i++) expect((await request(app).get("/v1/users")).status).toBe(200);
  });
});

describe("AI and search limits", () => {
  it("AI routes share one bucket per user; other routes are unaffected", async () => {
    const app = limitedApp({ ai: { perMinute: 2, perDay: 1000 } });
    await request(app).post(`/v1/users/${RIYA}/meals/parse-text`).send({ text: "2 roti" });
    await request(app).post(`/v1/users/${RIYA}/coach/chat`).send({});
    expect((await request(app).post(`/v1/users/${RIYA}/workouts/parse-voice`).send({})).status).toBe(429);
    expect((await request(app).post(`/v1/users/${RIYA}/meals/parse-photo`).send({})).status).toBe(429);
    expect((await request(app).post(`/v1/users/${ARJUN}/meals/parse-voice`).send({})).status).not.toBe(429);
    expect((await request(app).get(`/v1/users/${RIYA}/profile`)).status).not.toBe(429);
    // The search bucket is separate.
    expect((await request(app).post(`/v1/users/${RIYA}/nearby`).send({})).status).not.toBe(429);
  });

  it("food lookup and nearby share the search bucket", async () => {
    const app = limitedApp({ search: { perMinute: 1, perDay: 1000 } });
    await request(app).post(`/v1/users/${RIYA}/foods/lookup`).send({});
    expect((await request(app).post(`/v1/users/${RIYA}/nearby`).send({})).status).toBe(429);
    expect((await request(app).post(`/v1/users/${RIYA}/meals/parse-text`).send({ text: "x" })).status).not.toBe(429);
  });

  it("the daily cap holds after the minute resets, and resets at 00:00 UTC", async () => {
    const { app, advance } = clockApp({ ai: { perMinute: 2, perDay: 3 } });
    const parse = () => request(app).post(`/v1/users/${RIYA}/meals/parse-text`);
    expect((await parse()).status).toBe(200);
    expect((await parse()).status).toBe(200);
    // Turned away by the minute limit: doesn't use up the daily quota.
    expect((await parse()).status).toBe(429);
    advance(60_000);
    expect((await parse()).status).toBe(200);
    const res = await parse();
    expect(res.status).toBe(429);
    expect(res.body.error.message).toBe("Too many requests. Try again in about 14 h.");
    advance(14 * 3600_000);
    expect((await parse()).status).toBe(200);
  });
});

describe("store", () => {
  it("lets requests through if the store fails", async () => {
    const broken: RateLimitStore = {
      hit: async () => {
        throw new Error("redis down");
      },
    };
    const { app } = testApp({ rateLimit: { config: { ...LOOSE, general: { perMinutePerUser: 0, perMinutePerIp: 0 } }, store: broken } });
    expect((await request(app).get("/v1/users")).status).toBe(200);
  });

  it("memory store drops expired counters and caps its size", async () => {
    const store = memoryRateLimitStore({ maxKeys: 3 });
    const t = Date.UTC(2026, 9, 15);
    for (const k of ["a", "b", "c", "d"]) await store.hit(k, 60_000, t);
    expect(store.size()).toBe(3);
    expect((await store.hit("d", 60_000, t)).count).toBe(2);
    await store.hit("e", 60_000, t + 120_000);
    expect(store.size()).toBe(1);
  });
});
