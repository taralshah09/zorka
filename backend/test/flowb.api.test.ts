// P34 nearby search and P35 coach chat, with the search services and the AI faked (D59, D60).
import request from "supertest";
import { describe, expect, it } from "vitest";

import type { AiSlot } from "../src/modules/ai/ai.config.js";
import type { Fetch } from "../src/modules/ai/providers.js";
import { checkReply, needsSupport, trimReply } from "../src/modules/coach/safety.js";
import { areaOf } from "../src/modules/nearby/nearby.service.js";
import { onDomain } from "../src/modules/nearby/search.client.js";
import { RIYA, UNKNOWN, fakeAi, fakeSearch, testApp } from "./fakes.js";

const GROQ: AiSlot = { id: "groq#1", provider: "groq", apiKey: "k", models: { text: ["t"] } };
const aiReplying = (content: unknown, calls?: { n: number; bodies: string[] }): Fetch => async (_url, init) => {
  if (calls) {
    calls.n++;
    calls.bodies.push(String(init?.body ?? ""));
  }
  return Response.json({ model: "t", choices: [{ message: { content: JSON.stringify(content) } }] });
};

const ZOMATO_HITS = [
  { title: "Punjabi Tadka - Order online - Zomato", url: "https://www.zomato.com/pune/punjabi-tadka-baner/order", content: "Tandoori soya chaap, paneer tikka, dal makhani" },
  { title: "Not zomato", url: "https://evil.example.com/zomato", content: "phishing" },
];
const BLINKIT_HITS = [{ title: "Epigamia Greek Yogurt - Blinkit", url: "https://blinkit.com/prn/epigamia-greek-yogurt/prid/1", content: "Greek yogurt 90 g" }];

/** Fake Tavily: answers by include_domains; `fail` makes a domain's search return 500. */
function tavily(opts: { fail?: string[]; calls?: { n: number } } = {}): Fetch {
  return async (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { include_domains?: string[] };
    const domain = body.include_domains?.[0];
    if (opts.calls) opts.calls.n++;
    if (domain && opts.fail?.includes(domain)) return new Response("down", { status: 500 });
    if (!String(url).includes("tavily")) return new Response("no", { status: 404 });
    return Response.json({ results: domain === "zomato.com" ? ZOMATO_HITS : BLINKIT_HITS });
  };
}

const DISHES = {
  dishes: [
    { hit: 0, name: "Tandoori soya chaap", restaurant: "Punjabi Tadka", kcal: 420, proteinG: 28, carbsG: 30, fatG: 18, diet: "veg", junk: false },
    { hit: 0, name: "Gulab jamun", restaurant: "Punjabi Tadka", kcal: 300, proteinG: 4, carbsG: 50, fatG: 10, diet: "veg", junk: true },
    { hit: 1, name: "Epigamia Greek Yogurt", restaurant: null, kcal: 90, proteinG: 9, carbsG: 6, fatG: 3, diet: "veg", junk: false },
    { hit: 7, name: "Hallucinated dish", restaurant: null, kcal: 400, proteinG: 30, carbsG: 30, fatG: 10, diet: "veg", junk: false },
  ],
};

const body = { area: { locality: "Baner", city: "Pune" }, diet: "veg" };

describe("POST /users/:id/nearby (P34)", () => {
  it("search → AI estimate → junk and bad links dropped; Blinkit links are a search", async () => {
    const { app } = testApp({ ai: fakeAi([GROQ], aiReplying(DISHES)), search: fakeSearch(tavily()) });
    const res = await request(app).post(`/v1/users/${RIYA}/nearby`).send(body);
    expect(res.status).toBe(200);
    expect(res.body.areaKey).toBe("loc:baner|pune");
    expect(res.body.partial).toBe(false);
    const names = res.body.options.map((o: { name: string }) => o.name);
    expect(names).toEqual(["Tandoori soya chaap", "Epigamia Greek Yogurt"]);
    expect(res.body.options[0]).toMatchObject({
      source: "zomato",
      url: "https://www.zomato.com/pune/punjabi-tadka-baner/order",
      estimate: true,
      macros: { kcal: 420, proteinG: 28 },
    });
    expect(res.body.options[1]).toMatchObject({ source: "blinkit", url: "https://blinkit.com/s/?q=Epigamia%20Greek%20Yogurt" });
  });

  it("caches per area and diet for 12 h", async () => {
    const calls = { n: 0 };
    let t = Date.parse("2026-10-12T12:00:00Z");
    const { app } = testApp({ ai: fakeAi([GROQ], aiReplying(DISHES)), search: fakeSearch(tavily({ calls })), now: () => t });
    await request(app).post(`/v1/users/${RIYA}/nearby`).send(body);
    await request(app).post(`/v1/users/${RIYA}/nearby`).send({ ...body, area: { locality: " baner ", city: "PUNE" } });
    expect(calls.n).toBe(2); // one Zomato + one Blinkit search, then the cache
    await request(app).post(`/v1/users/${RIYA}/nearby`).send({ ...body, diet: "non_veg" });
    expect(calls.n).toBe(4);
    t += 12 * 60 * 60 * 1000 + 1;
    await request(app).post(`/v1/users/${RIYA}/nearby`).send(body);
    expect(calls.n).toBe(6);
  });

  it("one search failing still returns the other's options (partial, not cached)", async () => {
    const { app } = testApp({ ai: fakeAi([GROQ], aiReplying(DISHES)), search: fakeSearch(tavily({ fail: ["blinkit.com"] })) });
    const res = await request(app).post(`/v1/users/${RIYA}/nearby`).send(body);
    expect(res.status).toBe(200);
    expect(res.body.partial).toBe(true);
    expect(res.body.options.map((o: { source: string }) => o.source)).toEqual(["zomato"]);
  });

  it("falls back to the next search service", async () => {
    const fetchImpl: Fetch = async (url) => {
      if (String(url).includes("tavily")) return new Response("limit", { status: 429 });
      return Response.json({ success: true, data: { web: [{ url: ZOMATO_HITS[0]!.url, title: "Punjabi Tadka", description: "soya chaap" }] } });
    };
    const { app } = testApp({ ai: fakeAi([GROQ], aiReplying({ dishes: [DISHES.dishes[0]] })), search: fakeSearch(fetchImpl, { tavily: "t", firecrawl: "f" }) });
    const res = await request(app).post(`/v1/users/${RIYA}/nearby`).send(body);
    expect(res.status).toBe(200);
    expect(res.body.providers).toEqual(["firecrawl", "firecrawl"]);
  });

  it("Anakin's results are filtered to the domain", async () => {
    const fetchImpl: Fetch = async () =>
      Response.json({ results: [{ title: "x", url: "https://other.com/a", snippet: "s" }, { title: "Punjabi Tadka", url: ZOMATO_HITS[0]!.url, snippet: "soya" }] });
    const search = fakeSearch(fetchImpl, { anakin: "a" });
    const { hits, provider } = await search.search({ query: "q", domain: "zomato.com", maxResults: 6 });
    expect(provider).toBe("anakin");
    expect(hits.map((h) => h.url)).toEqual([ZOMATO_HITS[0]!.url]);
  });

  it("degrades with 503 SEARCH_UNAVAILABLE when every search fails or nothing is set up", async () => {
    const down = testApp({ ai: fakeAi([GROQ], aiReplying(DISHES)), search: fakeSearch(tavily({ fail: ["zomato.com", "blinkit.com"] })) });
    const res = await request(down.app).post(`/v1/users/${RIYA}/nearby`).send(body);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("SEARCH_UNAVAILABLE");
    const none = testApp({ search: fakeSearch(undefined, {}) });
    const res2 = await request(none.app).post(`/v1/users/${RIYA}/nearby`).send(body);
    expect(res2.body.error.code).toBe("SEARCH_UNAVAILABLE");
  });

  it("AI not set up → 503 AI_UNAVAILABLE (the phone shows the other options)", async () => {
    const { app } = testApp({ search: fakeSearch(tavily()) });
    const res = await request(app).post(`/v1/users/${RIYA}/nearby`).send(body);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("AI_UNAVAILABLE");
  });

  it("validates the area (no coordinates, a real pincode) and the user", async () => {
    const { app } = testApp();
    expect((await request(app).post(`/v1/users/${RIYA}/nearby`).send({ area: {}, diet: "veg" })).status).toBe(422);
    expect((await request(app).post(`/v1/users/${RIYA}/nearby`).send({ area: { pincode: "012345" }, diet: "veg" })).status).toBe(422);
    expect((await request(app).post(`/v1/users/${RIYA}/nearby`).send({ area: { lat: 18.5, lng: 73.8 }, diet: "veg" })).status).toBe(422);
    expect((await request(app).post(`/v1/users/${UNKNOWN}/nearby`).send(body)).status).toBe(404);
  });

  it("area keys and domain checks", () => {
    expect(areaOf({ pincode: "411045", city: "Pune" })).toEqual({ key: "pin:411045", label: "411045" });
    expect(areaOf({ locality: "Baner", city: "Pune" }).label).toBe("Baner Pune");
    expect(onDomain("https://www.zomato.com/x", "zomato.com")).toBe(true);
    expect(onDomain("https://zomato.com.evil.io/x", "zomato.com")).toBe(false);
    expect(onDomain("not a url", "zomato.com")).toBe(false);
  });
});

const ctx = {
  name: "Riya",
  goal: "lose_fat",
  diet: "veg",
  localTime: "20:30",
  state: "under",
  targetKcal: 2050,
  floorKcal: 1350,
  kcalLeft: 480,
  proteinLeftG: 45,
  carbsLeftG: 60,
  fatLeftG: 15,
  eatenKcal: 1570,
  eatenProteinG: 85,
  burnedKcal: 0,
  steps: 4200,
  stepGoal: 8000,
  streakDays: 23,
  workoutToday: false,
  mealsToday: ["Breakfast: Poha, Masala chai"],
};
const chat = (text: string, coach = "desi_legend") => ({ coach, messages: [{ role: "user", text }], context: ctx });

describe("POST /users/:id/coach/chat (P35)", () => {
  it("answers in the persona's voice with the day's numbers in the prompt", async () => {
    const calls = { n: 0, bodies: [] as string[] };
    const { app } = testApp({ ai: fakeAi([GROQ], aiReplying({ reply: "45 g protein baaki hai! Paneer bhurji tonight, chalo!" }, calls)) });
    const res = await request(app).post(`/v1/users/${RIYA}/coach/chat`).send(chat("What should I eat?"));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reply: "45 g protein baaki hai! Paneer bhurji tonight, chalo!", kind: "ai" });
    const sent = calls.bodies[0]!;
    expect(sent).toContain("Desi Legend");
    expect(sent).toContain("left 480");
    expect(sent).toContain("below 1350 kcal");
    expect(sent).toContain("Poha");
  });

  it("support signals get a fixed reply without calling the AI", async () => {
    const calls = { n: 0, bodies: [] as string[] };
    const { app } = testApp({ ai: fakeAi([GROQ], aiReplying({ reply: "x" }, calls)) });
    const res = await request(app).post(`/v1/users/${RIYA}/coach/chat`).send(chat("I make myself throw up after dinner"));
    expect(res.body.kind).toBe("support");
    expect(res.body.reply).toContain("14416");
    expect(calls.n).toBe(0);
  });

  it("a reply with swearing or unsafe advice is replaced by a safe line", async () => {
    for (const reply of ["Get your damn protein in.", "Skip dinner and you'll be fine.", "Run for 90 minutes tonight."]) {
      const { app } = testApp({ ai: fakeAi([GROQ], aiReplying({ reply })) });
      const res = await request(app).post(`/v1/users/${RIYA}/coach/chat`).send(chat("help", "drill_sergeant"));
      expect(res.body.kind).toBe("fallback");
      expect(res.body.reply).not.toContain(reply);
    }
  });

  it("AI not set up → 503 (the phone shows Coach is offline, no fake reply)", async () => {
    const { app } = testApp();
    const res = await request(app).post(`/v1/users/${RIYA}/coach/chat`).send(chat("hi"));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("AI_UNAVAILABLE");
  });

  it("validates the body", async () => {
    const { app } = testApp();
    const bad = { ...chat("hi"), messages: [{ role: "coach", text: "hello" }] };
    expect((await request(app).post(`/v1/users/${RIYA}/coach/chat`).send(bad)).status).toBe(422);
    expect((await request(app).post(`/v1/users/${RIYA}/coach/chat`).send({ ...chat("hi"), coach: "real_celebrity" })).status).toBe(422);
  });

  it("safety helpers", () => {
    expect(needsSupport("I want to starve myself this week")).toBe(true);
    expect(needsSupport("I'm starving, what's for dinner?")).toBe(false);
    expect(checkReply("A 40-minute walk tonight burns about 250.")).toBe("A 40-minute walk tonight burns about 250.");
    expect(checkReply("Walk for 60 minutes.")).not.toBeNull();
    expect(checkReply("Do 2 hours of cardio.")).toBeNull();
    const long = Array.from({ length: 120 }, (_, i) => (i === 50 ? "end." : "word")).join(" ");
    expect(trimReply(long).split(" ").length).toBeLessThanOrEqual(80);
  });
});
