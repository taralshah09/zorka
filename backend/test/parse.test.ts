// P15–P17 parser: the IDEATION scenarios, with the AI step faked.
import request from "supertest";
import { describe, expect, it } from "vitest";

import type { AiSlot } from "../src/modules/ai/ai.config.js";
import type { Fetch } from "../src/modules/ai/providers.js";
import { RIYA, UNKNOWN, fakeAi, testApp } from "./fakes.js";

const GROQ: AiSlot = {
  id: "groq#1",
  provider: "groq",
  apiKey: "k",
  models: { text: ["t"], vision: ["v"], stt: ["w"] },
};

/** Fake Groq: chat completions answer with `items`; Whisper answers with `transcript`. */
function groq(items: unknown[], transcript = ""): Fetch {
  return async (url) => {
    if (String(url).endsWith("/audio/transcriptions")) return Response.json({ text: transcript });
    return Response.json({ model: "t", choices: [{ message: { content: JSON.stringify({ items }) } }] });
  };
}

const HOME_LUNCH = [
  { name: "roti", quantity: 2, unit: "piece", confidence: 0.95 },
  { name: "rajma", quantity: 1, unit: "katori", confidence: 0.92 },
  { name: "salad", quantity: null, unit: null, confidence: 0.45 },
  { name: "chaas", quantity: 1, unit: "glass", confidence: 0.9 },
];

describe("POST /meals/parse-text (P15)", () => {
  it("home lunch: 4 items, salad flagged uncertain, macros from the DB", async () => {
    const { app } = testApp({ ai: fakeAi([GROQ], groq(HOME_LUNCH)) });
    const res = await request(app)
      .post(`/v1/users/${RIYA}/meals/parse-text`)
      .send({ text: "2 roti, 1 katori rajma, some salad, a glass of chaas" });
    expect(res.status).toBe(200);
    const items = res.body.items;
    expect(items.map((i: { food: { name: string } }) => i.food.name)).toEqual([
      "Roti (wheat chapati)",
      "Rajma curry",
      "Green salad",
      "Chaas (buttermilk)",
    ]);
    expect(items.map((i: { uncertain: boolean }) => i.uncertain)).toEqual([false, false, true, false]);
    expect(items[2].reasons).toEqual(["low_confidence", "vague_quantity"]);
    expect(items[0]).toMatchObject({ quantity: 2, unit: "piece", grams: 80, macros: { kcal: 232 } });
    expect(items[3]).toMatchObject({ unit: "glass", grams: 250, macros: { kcal: 75 } });
    expect(res.body.timings.totalMs).toBeGreaterThanOrEqual(0);
    expect(res.body.ai).toMatchObject({ slot: "groq#1" });
  });

  it("flags a food that isn't in the database (Search instead)", async () => {
    const { app } = testApp({ ai: fakeAi([GROQ], groq([{ name: "quinoa tabbouleh", quantity: 1, unit: "bowl", confidence: 0.9 }])) });
    const res = await request(app).post(`/v1/users/${RIYA}/meals/parse-text`).send({ text: "quinoa tabbouleh" });
    expect(res.body.items[0]).toMatchObject({ food: null, uncertain: true, reasons: ["no_match"], unit: "bowl" });
  });

  it("falls back to the food's default unit when the unit doesn't fit", async () => {
    const { app } = testApp({ ai: fakeAi([GROQ], groq([{ name: "rajma", quantity: 1, unit: "glass", confidence: 0.9 }])) });
    const res = await request(app).post(`/v1/users/${RIYA}/meals/parse-text`).send({ text: "a glass of rajma" });
    expect(res.body.items[0]).toMatchObject({ unit: "katori", uncertain: true, reasons: ["unit_unknown"] });
  });

  it("validates input and the user", async () => {
    const { app } = testApp({ ai: fakeAi([GROQ], groq([])) });
    expect((await request(app).post(`/v1/users/${RIYA}/meals/parse-text`).send({ text: "" })).status).toBe(422);
    expect((await request(app).post(`/v1/users/${UNKNOWN}/meals/parse-text`).send({ text: "roti" })).status).toBe(404);
  });

  it("returns 503 AI_UNAVAILABLE with no keys (the phone offers search)", async () => {
    const res = await request(testApp().app).post(`/v1/users/${RIYA}/meals/parse-text`).send({ text: "roti" });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("AI_UNAVAILABLE");
  });
});

describe("POST /meals/parse-voice (P16)", () => {
  const audio = { audioBase64: "A".repeat(400), mimeType: "audio/mp4" };

  it("transcribes, then runs the text pipeline", async () => {
    const { app } = testApp({ ai: fakeAi([GROQ], groq(HOME_LUNCH, "2 roti, 1 katori rajma, some salad, a glass of chaas")) });
    const res = await request(app).post(`/v1/users/${RIYA}/meals/parse-voice`).send(audio);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: "voice", transcript: "2 roti, 1 katori rajma, some salad, a glass of chaas" });
    expect(res.body.items).toHaveLength(4);
    expect(res.body.timings.sttMs).toBeGreaterThanOrEqual(0);
  });

  it("returns no items when no speech was detected", async () => {
    const { app } = testApp({ ai: fakeAi([GROQ], groq(HOME_LUNCH, " . ")) });
    const res = await request(app).post(`/v1/users/${RIYA}/meals/parse-voice`).send(audio);
    expect(res.body).toMatchObject({ transcript: "", items: [] });
  });

  it("accepts bodies over the normal 256 kb limit, rejects oversized ones", async () => {
    const { app } = testApp({ ai: fakeAi([GROQ], groq([], "")) });
    const big = await request(app)
      .post(`/v1/users/${RIYA}/meals/parse-voice`)
      .send({ ...audio, audioBase64: "A".repeat(600_000) });
    expect(big.status).toBe(200);
    const tooBig = await request(app)
      .post(`/v1/users/${RIYA}/meals/parse-voice`)
      .send({ ...audio, audioBase64: "A".repeat(1_600_000) });
    expect(tooBig.status).toBe(422);
  });
});

describe("POST /meals/parse-photo (P17)", () => {
  const photo = { imageBase64: "B".repeat(400), mimeType: "image/jpeg" };

  it("restaurant: noodles + manchurian, one 'Half plate or full?' question", async () => {
    const items = [
      { name: "veg hakka noodles", quantity: 1, unit: "plate", confidence: 0.85, portionUncertain: true },
      { name: "veg manchurian gravy", quantity: 1, unit: "plate", confidence: 0.75, portionUncertain: true },
    ];
    const { app } = testApp({ ai: fakeAi([GROQ], groq(items)) });
    const res = await request(app).post(`/v1/users/${RIYA}/meals/parse-photo`).send(photo);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { food: { name: string } }) => i.food.name)).toEqual([
      "Veg hakka noodles",
      "Veg manchurian (gravy)",
    ]);
    expect(res.body.followUp).toEqual({
      question: "Half plate or full?",
      itemIndexes: [0, 1],
      options: [
        { label: "Half plate", quantity: 1, unit: "plate_half" },
        { label: "Full plate", quantity: 1, unit: "plate_full" },
      ],
    });
  });

  it("not recognised: no items and no question", async () => {
    const { app } = testApp({ ai: fakeAi([GROQ], groq([])) });
    const res = await request(app).post(`/v1/users/${RIYA}/meals/parse-photo`).send(photo);
    expect(res.body).toMatchObject({ items: [], followUp: null });
  });

  it("rejects unsupported image types", async () => {
    const { app } = testApp({ ai: fakeAi([GROQ], groq([])) });
    expect((await request(app).post(`/v1/users/${RIYA}/meals/parse-photo`).send({ ...photo, mimeType: "image/gif" })).status).toBe(422);
  });
});
