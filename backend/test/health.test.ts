import request from "supertest";
import { describe, expect, it } from "vitest";

import { testApp } from "./fakes.js";

describe("GET /v1/health", () => {
  it("reports ok when the database answers", async () => {
    const res = await request(testApp().app).get("/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.db.status).toBe("ok");
  });

  it("returns 503 degraded when the database is down", async () => {
    const res = await request(testApp({ dbUp: false }).app).get("/v1/health");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "degraded", db: { status: "down" } });
  });
});

describe("error format", () => {
  it("unknown routes return the standard error envelope", async () => {
    const res = await request(testApp().app).get("/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "No route for GET /v1/nope" } });
  });

  it("malformed JSON returns 400 BAD_REQUEST", async () => {
    const res = await request(testApp().app)
      .put("/v1/users/6f1c2a3e-0b4d-4c7a-9e21-5a7b3c9d0e11/profile")
      .set("content-type", "application/json")
      .send("{bad json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });
});
