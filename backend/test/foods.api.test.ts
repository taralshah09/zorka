// P11–P13 HTTP: food search/detail/catalog, meal_log + custom_food sync, per-day meal list.
import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { curatedFoodId } from "../src/modules/foods/catalog.js";
import { ARJUN, RIYA, UNKNOWN, testApp } from "./fakes.js";

const RAJMA = curatedFoodId("rajma");
const ROTI = curatedFoodId("roti");

const op = (entity: string, over: Record<string, unknown> = {}) => ({
  opId: randomUUID(),
  entity,
  action: "upsert",
  id: randomUUID(),
  clientUpdatedAt: "2026-10-11T13:00:00.000Z",
  ...over,
});

const meal = (over: Record<string, unknown> = {}) => ({
  mealType: "lunch",
  loggedAt: "2026-10-11T13:00:00.000+05:30",
  localDate: "2026-10-11",
  source: "search",
  items: [
    { id: randomUUID(), foodId: ROTI, name: "Roti", quantity: 2, unit: "piece", grams: 80, kcal: 232, proteinG: 7.6, carbsG: 41.6, fatG: 4 },
    { id: randomUUID(), foodId: RAJMA, name: "Rajma curry", quantity: 1, unit: "katori", grams: 150, kcal: 210, proteinG: 9.8, carbsG: 24, fatG: 8.3 },
  ],
  ...over,
});

describe("foods API (P11/P12)", () => {
  it("returns a dish with its unit conversions", async () => {
    const res = await request(testApp().app).get(`/v1/foods/${RAJMA}`);
    expect(res.status).toBe(200);
    expect(res.body.food).toMatchObject({
      name: "Rajma curry",
      diet: "veg",
      homeCooked: true,
      defaultUnit: "katori",
      units: [
        { unit: "katori", grams: 150 },
        { unit: "bowl", grams: 250 },
        { unit: "g", grams: 1 },
      ],
    });
  });

  it("searches by name and alias, best match first", async () => {
    const { app } = testApp();
    const res = await request(app).get("/v1/foods").query({ q: "chapati" });
    expect(res.body.foods[0].id).toBe(ROTI);
    expect((await request(app).get("/v1/foods").query({ q: "" })).body.foods).toEqual([]);
  });

  it("404s for an unknown food and validates ids", async () => {
    const { app } = testApp();
    expect((await request(app).get(`/v1/foods/${UNKNOWN}`)).status).toBe(404);
    expect((await request(app).get("/v1/foods/nope")).status).toBe(422);
  });
});

describe("meal_log sync (P12)", () => {
  it("saves a meal with its items and lists it for the day", async () => {
    const { app } = testApp();
    const o = op("meal_log", { data: meal() });
    const res = await request(app).post(`/v1/users/${RIYA}/sync`).send({ ops: [o] });
    expect(res.body.results).toEqual([{ opId: o.opId, status: "applied" }]);

    const list = await request(app).get(`/v1/users/${RIYA}/meals`).query({ date: "2026-10-11" });
    expect(list.body.meals).toHaveLength(1);
    expect(list.body.meals[0]).toMatchObject({ id: o.id, mealType: "lunch", source: "search" });
    expect(list.body.meals[0].items.map((i: { name: string }) => i.name)).toEqual(["Roti", "Rajma curry"]);
  });

  it("an edit replaces the items; a delete hides the meal", async () => {
    const { app, meals } = testApp();
    const id = randomUUID();
    await request(app).post(`/v1/users/${RIYA}/sync`).send({ ops: [op("meal_log", { id, data: meal() })] });
    const edited = meal({ items: [meal().items[0]] });
    await request(app)
      .post(`/v1/users/${RIYA}/sync`)
      .send({ ops: [op("meal_log", { id, data: edited, clientUpdatedAt: "2026-10-11T13:05:00.000Z" })] });
    expect(meals.rows.get(id)?.items).toHaveLength(1);

    await request(app)
      .post(`/v1/users/${RIYA}/sync`)
      .send({ ops: [op("meal_log", { id, action: "delete", clientUpdatedAt: "2026-10-11T13:10:00.000Z" })] });
    const list = await request(app).get(`/v1/users/${RIYA}/meals`).query({ date: "2026-10-11" });
    expect(list.body.meals).toEqual([]);
  });

  it("keeps the meal when an item points at an unknown food (link set to null)", async () => {
    const { app, meals } = testApp();
    const o = op("meal_log", { data: meal({ items: [{ ...meal().items[0], foodId: UNKNOWN }] }) });
    await request(app).post(`/v1/users/${RIYA}/sync`).send({ ops: [o] });
    expect(meals.rows.get(o.id)?.items[0]?.foodId).toBeNull();
  });

  it("rejects a bad meal and never lets another user overwrite it", async () => {
    const { app } = testApp();
    const bad = op("meal_log", { data: meal({ items: [] }) });
    expect((await request(app).post(`/v1/users/${RIYA}/sync`).send({ ops: [bad] })).body.results[0].status).toBe("rejected");

    const id = randomUUID();
    await request(app).post(`/v1/users/${RIYA}/sync`).send({ ops: [op("meal_log", { id, data: meal() })] });
    const steal = await request(app)
      .post(`/v1/users/${ARJUN}/sync`)
      .send({ ops: [op("meal_log", { id, data: meal(), clientUpdatedAt: "2026-10-12T00:00:00.000Z" })] });
    expect(steal.body.results[0].status).toBe("rejected");
  });
});

describe("custom_food sync (P13)", () => {
  const food = {
    name: "Mom's besan ladoo",
    diet: "veg",
    serving: { unit: "piece", grams: 60 },
    kcal: 270,
    proteinG: 5.4,
    carbsG: 30,
    fatG: 15,
  };

  it("stores per 100 g, is visible only to its owner, and shows up in search", async () => {
    const { app } = testApp();
    const o = op("custom_food", { data: food });
    expect((await request(app).post(`/v1/users/${RIYA}/sync`).send({ ops: [o] })).body.results[0].status).toBe("applied");

    const mine = await request(app).get(`/v1/users/${RIYA}/foods`).query({ q: "mom besan ladoo" });
    expect(mine.body.foods[0]).toMatchObject({
      id: o.id,
      custom: true,
      defaultUnit: "piece",
      per100g: { kcal: 450, proteinG: 9, carbsG: 50, fatG: 25 },
      units: [
        { unit: "piece", grams: 60 },
        { unit: "g", grams: 1 },
      ],
    });

    const catalogRiya = await request(app).get(`/v1/users/${RIYA}/foods/catalog`);
    const catalogArjun = await request(app).get(`/v1/users/${ARJUN}/foods/catalog`);
    expect(catalogRiya.body.foods.length).toBe(catalogArjun.body.foods.length + 1);
    expect((await request(app).get(`/v1/foods/${o.id}`)).status).toBe(404);
  });

  it("never edits a curated food", async () => {
    const { app } = testApp();
    const res = await request(app)
      .post(`/v1/users/${RIYA}/sync`)
      .send({ ops: [op("custom_food", { id: ROTI, data: food })] });
    expect(res.body.results[0]).toMatchObject({ status: "rejected" });
  });
});
