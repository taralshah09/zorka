// LA1–LA7 API: the life plan entities over sync and the pull feed (a reinstall restores them), the standing-life
// profile fields, brief parsing (LA2 exit: "expo tomorrow 1–7, client dinner at 8"), menu page reading, the coach's
// new buttons and the menu rate limit. The AI is faked.
import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { memoryRateLimitStore, type RateLimitConfig } from "../src/http/rateLimit.js";
import type { AiSlot } from "../src/modules/ai/ai.config.js";
import type { Fetch } from "../src/modules/ai/providers.js";
import { ARJUN, RIYA, UNKNOWN, fakeAi, testApp } from "./fakes.js";

const GROQ: AiSlot = { id: "groq#1", provider: "groq", apiKey: "k", models: { text: ["t"], vision: ["v"], stt: ["w"] } };
const replying = (content: unknown, calls?: { bodies: string[] }, transcript = ""): Fetch => async (url, init) => {
  if (String(url).endsWith("/audio/transcriptions")) return Response.json({ text: transcript });
  calls?.bodies.push(String(init?.body ?? ""));
  return Response.json({ model: "t", choices: [{ message: { content: JSON.stringify(content) } }] });
};

const op = (entity: string, data: unknown, over: Record<string, unknown> = {}) => ({
  opId: randomUUID(),
  entity,
  action: "upsert",
  id: randomUUID(),
  clientUpdatedAt: "2026-10-20T10:00:00.000Z",
  data,
  ...over,
});
const sync = (app: Parameters<typeof request>[0], userId: string, ops: unknown[]) =>
  request(app).post(`/v1/users/${userId}/sync`).send({ ops });

const brief = (over: Record<string, unknown> = {}) => ({
  localDate: "2026-10-21",
  rawText: "expo 1 to 7",
  parsed: { blocks: [{ from: 780, to: 1140, kind: "event", label: "Expo" }], whereabouts: "away_local", mealAccess: {}, flags: [] },
  status: "confirmed",
  source: "brief",
  ...over,
});
const plan = (over: Record<string, unknown> = {}) => ({
  localDate: "2026-10-21",
  plan: { date: "2026-10-21", dayType: "away", items: [] },
  inputsHash: "a1b2c3d4",
  acceptedAt: "2026-10-20T21:40:00.000+05:30",
  ...over,
});
const fact = (over: Record<string, unknown> = {}) => ({
  key: "usual_meal:lunch:weekday",
  kind: "pattern",
  value: { slot: "lunch", text: "dal + 3 roti", at: 810 },
  text: "Lunch on weekdays is usually dal + 3 roti around 1:30pm",
  source: "inferred",
  confidence: 0.9,
  evidence: { count: 6, window: 28, lastSeen: "2026-10-19" },
  status: "active",
  validFrom: null,
  validUntil: null,
  ...over,
});

describe("life plan entities over sync (LA1–LA5)", () => {
  it("day_brief: stored with its facts cleaned, LWW, deleted", async () => {
    const { app, life } = testApp();
    const first = op("day_brief", brief({ parsed: { blocks: [{ from: 780, to: 1140, kind: "party" }, { from: "x" }], whereabouts: "moon" } }));
    expect((await sync(app, RIYA, [first])).body.results[0].status).toBe("applied");
    expect(life.briefRows.get(first.id)).toMatchObject({
      userId: RIYA,
      status: "confirmed",
      parsed: { blocks: [{ from: 780, to: 1140, kind: "other" }], whereabouts: "home", mealAccess: {}, flags: [] },
    });
    const older = op("day_brief", brief({ rawText: "old" }), { id: first.id, clientUpdatedAt: "2026-10-20T09:00:00.000Z" });
    expect((await sync(app, RIYA, [older])).body.results[0].status).toBe("stale");
    const del = op("day_brief", undefined, { id: first.id, action: "delete", clientUpdatedAt: "2026-10-20T11:00:00.000Z" });
    expect((await sync(app, RIYA, [del])).body.results[0].status).toBe("applied");
    expect(life.briefRows.get(first.id)?.deletedAt).toBeInstanceOf(Date);
  });

  it("day_plan and memory_fact: stored; bad payloads and someone else's record are rejected", async () => {
    const { app, life } = testApp();
    const p = op("day_plan", plan());
    const f = op("memory_fact", fact());
    const res = (await sync(app, RIYA, [p, f])).body.results;
    expect(res.map((r: { status: string }) => r.status)).toEqual(["applied", "applied"]);
    expect(life.planRows.get(p.id)?.acceptedAt).toBeInstanceOf(Date);
    expect(life.factRows.get(f.id)).toMatchObject({ key: "usual_meal:lunch:weekday", status: "active" });

    const bad = (
      await sync(app, RIYA, [
        op("day_plan", plan({ localDate: "21/10/2026" })),
        op("day_plan", plan({ inputsHash: "" })),
        op("memory_fact", fact({ confidence: 1.5 })),
        op("memory_fact", fact({ status: "maybe" })),
        op("memory_fact", fact({ text: "" })),
        op("day_brief", brief({ status: "final" })),
        op("day_brief", { ...brief(), extra: 1 }),
      ])
    ).body.results;
    expect(bad.map((r: { status: string }) => r.status)).toEqual(Array(7).fill("rejected"));

    const theirs = op("memory_fact", fact(), { id: f.id, clientUpdatedAt: "2026-10-21T00:00:00.000Z" });
    expect((await sync(app, ARJUN, [theirs])).body.results[0].status).toBe("rejected");
  });

  it("the pull feed returns all three, so a reinstall gets memory, briefs and plans back", async () => {
    const { app } = testApp();
    const b = op("day_brief", brief());
    const p = op("day_plan", plan());
    const f = op("memory_fact", fact());
    await sync(app, RIYA, [b, p, f]);
    await sync(app, ARJUN, [op("memory_fact", fact())]);
    const res = await request(app).get(`/v1/users/${RIYA}/changes`);
    expect(res.status).toBe(200);
    const byEntity = (e: string) => res.body.changes.filter((c: { entity: string }) => c.entity === e);
    expect(byEntity("day_brief")[0]).toMatchObject({ id: b.id, deleted: false, data: { localDate: "2026-10-21", rawText: "expo 1 to 7", clientUpdatedAt: b.clientUpdatedAt } });
    expect(byEntity("day_plan")[0]).toMatchObject({ id: p.id, data: { inputsHash: "a1b2c3d4", acceptedAt: "2026-10-20T16:10:00.000Z" } });
    expect(byEntity("memory_fact")).toHaveLength(1);
    expect(byEntity("memory_fact")[0].data).toMatchObject({ key: "usual_meal:lunch:weekday", evidence: { count: 6 } });
  });
});

describe("standing life on the profile (LA1)", () => {
  it("saves and returns the answers; skipped answers are null", async () => {
    const { app } = testApp();
    const put = await request(app)
      .put(`/v1/users/${RIYA}/profile`)
      .send({ mealSource: "mess", budget: "tight", workPattern: "student", hasKitchen: false, hasFridge: null, sessionsPerWeek: 3, briefPromptMinute: 1260 });
    expect(put.status).toBe(200);
    expect(put.body.profile).toMatchObject({ mealSource: "mess", budget: "tight", workPattern: "student", hasKitchen: false, hasFridge: null, sessionsPerWeek: 3, briefPromptMinute: 1260 });
    const fresh = await request(app).get(`/v1/users/${ARJUN}/profile`);
    expect(fresh.body.profile).toMatchObject({ mealSource: null, budget: null, sessionsPerWeek: null, briefPromptMinute: null });
  });

  it("rejects out-of-range answers", async () => {
    const { app } = testApp();
    for (const body of [{ sessionsPerWeek: 8 }, { budget: "rich" }, { briefPromptMinute: 1440 }, { mealSource: "hotel" }])
      expect((await request(app).put(`/v1/users/${RIYA}/profile`).send(body)).status).toBe(422);
  });
});

describe("POST /brief/parse (LA2)", () => {
  const body = { text: "expo tomorrow 1 to 7, client dinner at 8", forDate: "2026-10-21", today: "2026-10-20", localTime: "21:05" };

  it("'expo tomorrow 1–7, client dinner at 8' → blocks 13:00–19:00 and 20:00–22:00, one question", async () => {
    const calls = { bodies: [] as string[] };
    const ai = replying(
      {
        blocks: [
          { from: "13:00", to: "19:00", kind: "event", label: "Expo" },
          { from: "20:00", to: "22:00", kind: "social", label: "Client dinner", canEat: true },
        ],
        whereabouts: "away_local",
        mealAccess: { dinner: "eat_out", lunch: "pizza" },
        flags: ["party"],
        question: "Does the expo have food stalls?",
      },
      calls,
    );
    const { app } = testApp({ ai: fakeAi([GROQ], ai) });
    const res = await request(app).post(`/v1/users/${RIYA}/brief/parse`).send({ ...body, recentFacts: ["Lunch is usually at the office canteen"] });
    expect(res.status).toBe(200);
    expect(res.body.facts.blocks).toEqual([
      { from: 780, to: 1140, kind: "event", label: "Expo" },
      { from: 1200, to: 1320, kind: "social", label: "Client dinner", canEat: true },
    ]);
    expect(res.body.facts.mealAccess).toEqual({ dinner: "eat_out", lunch: "unknown" });
    expect(res.body.facts.flags).toEqual([]);
    expect(res.body.question).toBe("Does the expo have food stalls?");
    expect(calls.bodies[0]).toContain("2026-10-21 (Wednesday)");
    expect(calls.bodies[0]).toContain("office canteen");
    expect(calls.bodies[0]).toContain("Never output calories");
  });

  it("a voice brief is transcribed first", async () => {
    const { app } = testApp({ ai: fakeAi([GROQ], replying({ blocks: [{ from: "06:00", to: "11:00", kind: "travel", label: "Flight" }], whereabouts: "travelling" }, undefined, "flight at 6 tomorrow")) });
    const res = await request(app)
      .post(`/v1/users/${RIYA}/brief/parse`)
      .send({ audioBase64: "A".repeat(200), mimeType: "audio/mp4", forDate: "2026-10-22", today: "2026-10-21", localTime: "21:00" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ transcript: "flight at 6 tomorrow", facts: { whereabouts: "travelling", blocks: [{ from: 360, to: 660, kind: "travel" }] } });
  });

  it("garbage from the AI falls through to the next slot; no AI means an error, never a guess", async () => {
    const none = testApp();
    const res = await request(none.app).post(`/v1/users/${RIYA}/brief/parse`).send(body);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("AI_UNAVAILABLE");
    expect((await request(none.app).post(`/v1/users/${UNKNOWN}/brief/parse`).send(body)).status).toBe(404);
  });

  it("validates the body: text or audio, dates", async () => {
    const { app } = testApp({ ai: fakeAi([GROQ], replying({ blocks: [] })) });
    for (const bad of [{ ...body, text: undefined }, { ...body, forDate: "tomorrow" }, { ...body, audioBase64: "A".repeat(200), mimeType: "audio/mp4" }])
      expect((await request(app).post(`/v1/users/${RIYA}/brief/parse`).send(bad)).status).toBe(422);
  });
});

describe("POST /menu/read (LA7)", () => {
  const page = { imageBase64: "A".repeat(200), mimeType: "image/jpeg", page: 2, diet: "veg" };

  it("returns the page's dishes, dropping bad ones, with ranges sorted", async () => {
    const { app } = testApp({
      ai: fakeAi(
        [GROQ],
        replying({
          unreadable: false,
          restaurant: "Sher-e-Punjab",
          currency: "INR",
          dishes: [
            { name: "Paneer Tikka", section: "Tandoor", price: 260, veg: true, tags: ["tandoor", "paneer", "spicy"], est: { kcal: [350, 250], proteinG: [18, 26], carbsG: [8, 15], fatG: [15, 24] } },
            { name: "Dal Tadka", price: "180", veg: null, tags: ["dal"], est: { kcal: [150, 200], proteinG: [8, 11], carbsG: [20, 30], fatG: [5, 9] } },
            { name: "", est: {} },
            { name: "No estimate" },
          ],
        }),
      ),
    });
    const res = await request(app).post(`/v1/users/${RIYA}/menu/read`).send(page);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 2, unreadable: false, restaurant: "Sher-e-Punjab" });
    expect(res.body.dishes).toHaveLength(2);
    expect(res.body.dishes[0]).toMatchObject({ name: "Paneer Tikka", tags: ["tandoor", "paneer"], est: { kcal: [250, 350] } });
    expect(res.body.dishes[1]).toMatchObject({ price: 180, veg: null });
  });

  it("an unreadable page says so", async () => {
    const { app } = testApp({ ai: fakeAi([GROQ], replying({ unreadable: true, dishes: [] })) });
    expect((await request(app).post(`/v1/users/${RIYA}/menu/read`).send(page)).body).toMatchObject({ unreadable: true, dishes: [] });
  });

  it("validates the page", async () => {
    const { app } = testApp({ ai: fakeAi([GROQ], replying({ dishes: [] })) });
    for (const bad of [{ ...page, page: 13 }, { ...page, mimeType: "image/gif" }, { ...page, imageBase64: "x" }])
      expect((await request(app).post(`/v1/users/${RIYA}/menu/read`).send(bad)).status).toBe(422);
  });

  it("12 pages a minute per user, on their own bucket", async () => {
    const LOOSE: RateLimitConfig = { general: { perMinutePerUser: 1000, perMinutePerIp: 1000 }, ai: { perMinute: 1, perDay: 1 }, search: { perMinute: 1000, perDay: 1000 } };
    const { app } = testApp({ ai: fakeAi([GROQ], replying({ dishes: [] })), rateLimit: { config: LOOSE, store: memoryRateLimitStore() } });
    const codes: number[] = [];
    for (let i = 0; i < 13; i++) codes.push((await request(app).post(`/v1/users/${RIYA}/menu/read`).send(page)).status);
    expect(codes.slice(0, 12).every((c) => c === 200)).toBe(true);
    expect(codes[12]).toBe(429);
  });
});

describe("coach knows the plan (LA6)", () => {
  const context = {
    localTime: "20:30",
    state: "on_track",
    targetKcal: 2000,
    floorKcal: 1500,
    kcalLeft: 600,
    proteinLeftG: 40,
    carbsLeftG: 60,
    fatLeftG: 20,
    eatenKcal: 1400,
    eatenProteinG: 90,
    burnedKcal: 0,
    stepGoal: 8000,
    streakDays: 3,
    workoutToday: false,
    mealsToday: [],
    today: "2026-10-20",
    dayType: "late_work",
    planSummary: ["13:15 walk 20 min"],
    weekSummary: ["Saturday pre-banked"],
    facts: ["Lunch is usually at the mess"],
  };
  const chat = (text: string) => ({ coach: "calm_mentor", messages: [{ role: "user", text }], context });

  it("'I'm at a wedding Saturday' offers Plan Saturday; the plan and facts are in the prompt", async () => {
    const calls = { bodies: [] as string[] };
    const actions = [
      { type: "plan_day", label: "Plan Saturday", date: "2026-10-24", text: "wedding on Saturday" },
      { type: "remember_fact", label: "Remember this", text: "Weddings mean a late dinner" },
    ];
    const { app } = testApp({ ai: fakeAi([GROQ], replying({ reply: "Enjoy it. Let's plan Saturday.", actions }, calls)) });
    const res = await request(app).post(`/v1/users/${RIYA}/coach/chat`).send(chat("I'm at a wedding Saturday"));
    expect(res.status).toBe(200);
    expect(res.body.actions).toEqual(actions);
    expect(calls.bodies[0]).toContain("PLAN today: 13:15 walk 20 min");
    expect(calls.bodies[0]).toContain("Known about them: Lunch is usually at the mess");
  });

  it("drops plan_day outside the next 7 days and opens the new screens", async () => {
    const actions = [
      { type: "plan_day", label: "Plan next month", date: "2026-11-20", text: "trip" },
      { type: "open", label: "Scan the menu", screen: "menu_scan" },
      { type: "open", label: "Brief tomorrow", screen: "plan_tomorrow" },
    ];
    const { app } = testApp({ ai: fakeAi([GROQ], replying({ reply: "Sure.", actions })) });
    const res = await request(app).post(`/v1/users/${RIYA}/coach/chat`).send(chat("I'm out for dinner"));
    expect(res.body.actions).toEqual([actions[1], actions[2]]);
  });
});

describe("POST /plan/week (D85)", () => {
  const day = (date: string, over: Record<string, unknown> = {}) => ({
    date,
    dayType: "normal",
    brief: null,
    base: { kcal: 2000, proteinG: 130, steps: 8000 },
    actual: null,
    achievableProteinG: null,
    canTrain: true,
    code: { kcal: 2000, proteinG: 130, steps: 8000, train: false },
    ...over,
  });
  const body = {
    today: "2026-10-20",
    focusDate: "2026-10-20",
    goal: "maintain",
    floorKcal: 1500,
    sessionsTarget: 3,
    standing: { mealSource: "mess", budget: "tight" },
    facts: ["Lunch is at the mess"],
    days: [
      day("2026-10-19", { actual: { kcal: 2000, proteinG: 90, steps: 6000, trained: true } }),
      day("2026-10-20", { brief: "session 2 to 11 pm", dayType: "late_work", achievableProteinG: 68, canTrain: false }),
      day("2026-10-21"),
    ],
  };

  it("passes on today-onward days from the model, drops past/unknown/duplicate days, filters reasons; the prompt has the week", async () => {
    const calls = { bodies: [] as string[] };
    const { app } = testApp({
      ai: fakeAi(
        [GROQ],
        replying(
          {
            days: [
              { date: "2026-10-19", kcal: 1, proteinG: 1, steps: 1, train: true },
              { date: "2026-10-20", kcal: 2000, proteinG: 68, steps: 6000, train: false, reason: "A long session: protein early, a short walk at lunch." },
              { date: "2026-10-21", kcal: "2100", proteinG: 155, steps: 9000, train: true, reason: "Skip dinner tonight." },
              { date: "2026-10-21", kcal: 9, proteinG: 9, steps: 9, train: false },
              { date: "2027-01-01", kcal: 9, proteinG: 9, steps: 9, train: false },
              { nope: true },
            ],
            summary: "Tuesday is a long day; Wednesday picks up the protein.",
          },
          calls,
        ),
      ),
    });
    const res = await request(app).post(`/v1/users/${RIYA}/plan/week`).send(body);
    expect(res.status).toBe(200);
    expect(res.body.days).toEqual([
      { date: "2026-10-20", kcal: 2000, proteinG: 68, steps: 6000, train: false, reason: "A long session: protein early, a short walk at lunch." },
      { date: "2026-10-21", kcal: 2100, proteinG: 155, steps: 9000, train: true },
    ]);
    expect(res.body.summary).toBe("Tuesday is a long day; Wednesday picks up the protein.");
    const sent = calls.bodies[0]!;
    expect(sent).toContain("session 2 to 11 pm");
    expect(sent).toContain("realistic protein 68");
    expect(sent).toContain("logged 2000 kcal/90 g/6000 steps, trained");
    expect(sent).toContain("never below the floor");
  });

  it("no AI means an error (the phone keeps the code plan); bad bodies are rejected", async () => {
    const none = testApp();
    const res = await request(none.app).post(`/v1/users/${RIYA}/plan/week`).send(body);
    expect(res.status).toBe(503);
    const { app } = testApp({ ai: fakeAi([GROQ], replying({ days: [] })) });
    for (const bad of [{ ...body, days: [] }, { ...body, sessionsTarget: 9 }, { ...body, today: "today" }])
      expect((await request(app).post(`/v1/users/${RIYA}/plan/week`).send(bad)).status).toBe(422);
  });
});
