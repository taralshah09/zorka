// Food lookup for voice-logged foods the catalog doesn't have: open-web search → AI-read nutrition (search + AI faked).
import request from "supertest";
import { describe, expect, it } from "vitest";

import type { AiSlot } from "../src/modules/ai/ai.config.js";
import type { Fetch } from "../src/modules/ai/providers.js";
import { RIYA, UNKNOWN, fakeAi, fakeSearch, testApp } from "./fakes.js";

const GROQ: AiSlot = { id: "groq#1", provider: "groq", apiKey: "k", models: { text: ["t"] } };
const aiReplying = (content: unknown): Fetch => async () =>
  Response.json({ model: "t", choices: [{ message: { content: JSON.stringify(content) } }] });

const HITS = [
  { title: "Sabudana Khichdi Calories - Nutrition Facts", url: "https://example.com/sabudana", content: "1 katori (150 g): 290 kcal, protein 4.5 g, carbs 48 g, fat 9 g" },
];

/** Fake Tavily that records the request bodies. */
function tavily(results: unknown[] = HITS, calls?: { n: number; bodies: Record<string, unknown>[] }): Fetch {
  return async (_url, init) => {
    if (calls) {
      calls.n++;
      calls.bodies.push(JSON.parse(String(init?.body ?? "{}")));
    }
    return Response.json({ results });
  };
}

const FOUND = {
  found: true,
  hit: 0,
  name: "Sabudana khichdi",
  diet: "veg",
  liquid: false,
  homeCooked: true,
  unit: "katori",
  gramsPerServing: 150,
  kcal: 290.4,
  proteinG: 4.54,
  carbsG: 48,
  fatG: 9,
};

describe("POST /users/:id/foods/lookup", () => {
  it("searches the open web and returns one serving's nutrition with its source", async () => {
    const calls = { n: 0, bodies: [] as Record<string, unknown>[] };
    const { app } = testApp({ ai: fakeAi([GROQ], aiReplying(FOUND)), search: fakeSearch(tavily(HITS, calls)) });
    const res = await request(app).post(`/v1/users/${RIYA}/foods/lookup`).send({ name: "sabudana khichdi" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      found: true,
      provider: "tavily",
      source: { url: "https://example.com/sabudana" },
      food: { name: "Sabudana khichdi", diet: "veg", serving: { unit: "katori", grams: 150 }, kcal: 290, proteinG: 4.5 },
    });
    expect(calls.bodies[0]).not.toHaveProperty("include_domains");
  });

  it("caches found results per name", async () => {
    const calls = { n: 0, bodies: [] as Record<string, unknown>[] };
    const { app } = testApp({ ai: fakeAi([GROQ], aiReplying(FOUND)), search: fakeSearch(tavily(HITS, calls)) });
    await request(app).post(`/v1/users/${RIYA}/foods/lookup`).send({ name: "Sabudana Khichdi" });
    const res = await request(app).post(`/v1/users/${RIYA}/foods/lookup`).send({ name: " sabudana  khichdi " });
    expect(res.body.found).toBe(true);
    expect(calls.n).toBe(1);
  });

  it("not found when the AI finds no numbers, points at no result, or there are no hits", async () => {
    for (const [hits, reply] of [
      [HITS, { found: false }],
      [HITS, { ...FOUND, hit: 5 }],
      [HITS, { ...FOUND, kcal: null }],
      [[], FOUND],
    ] as const) {
      const { app } = testApp({ ai: fakeAi([GROQ], aiReplying(reply)), search: fakeSearch(tavily([...hits])) });
      const res = await request(app).post(`/v1/users/${RIYA}/foods/lookup`).send({ name: "mystery dish" });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ found: false, food: null, source: null });
    }
  });

  it("degrades with 503 when search isn't set up", async () => {
    const { app } = testApp({ ai: fakeAi([GROQ], aiReplying(FOUND)), search: fakeSearch(undefined, {}) });
    const res = await request(app).post(`/v1/users/${RIYA}/foods/lookup`).send({ name: "poha" });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("SEARCH_UNAVAILABLE");
  });

  it("validates the name and the user", async () => {
    const { app } = testApp();
    expect((await request(app).post(`/v1/users/${RIYA}/foods/lookup`).send({ name: " " })).status).toBe(422);
    expect((await request(app).post(`/v1/users/${RIYA}/foods/lookup`).send({ name: "x", extra: 1 })).status).toBe(422);
    expect((await request(app).post(`/v1/users/${UNKNOWN}/foods/lookup`).send({ name: "poha" })).status).toBe(404);
  });
});
