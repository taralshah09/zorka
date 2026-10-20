// AB2 / AB6 / AB8 · POST /v1/users/:id/assistant/turn with a scripted AI (docs/ASSISTANT_BAR_PLAN.md). The fake network
// answers each AI step by its prompt: speech-to-text, the router, the meal and gym parsers, the brief parser and the
// phrasing step. The eval set (test/fixtures/assistant/*.json) runs the same way: each fixture carries the router's
// answer, and the real catalog matching, turn rules, tiers and reply checks run on it.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";

import type { AiSlot } from "../src/modules/ai/ai.config.js";
import type { Fetch } from "../src/modules/ai/providers.js";
import { NOTHING_LINE } from "../src/modules/assistant/assistant.service.js";
import type { AssistantTurnResult } from "../src/modules/assistant/assistant.schemas.js";
import { BASE_VOCABULARY } from "../src/modules/assistant/vocab.js";
import { SUPPORT_REPLY } from "../src/modules/coach/safety.js";
import { OUT_OF_SCOPE_LINE } from "../../shared/domain/assistant.js";
import { RIYA, UNKNOWN, fakeAi, testApp } from "./fakes.js";

const GROQ: AiSlot = { id: "groq#1", provider: "groq", apiKey: "k", models: { text: ["t"], stt: ["w"] } };
const TODAY = "2026-10-20";
const AUDIO = "A".repeat(200);

type Segment = { avg_logprob: number; no_speech_prob: number };
type Script = {
  heard?: string;
  segments?: Segment[] | null;
  router?: unknown;
  meals?: Record<string, unknown[]>;
  gym?: Record<string, unknown[]>;
  brief?: unknown;
  /** The phrasing step's reply; default: the FACTS lines as given (always grounded). */
  reply?: string;
  /** Steps that answer with an HTTP 500. */
  fail?: ("router" | "phrase" | "brief")[];
};
type Seen = { stt: string[]; router: string[]; meal: string[]; gym: string[]; brief: string[]; phrase: string[] };

const json = (content: unknown) =>
  Response.json({ model: "t", choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] });

/** A fake provider network that answers each AI step from the script. */
function scripted(s: Script, seen: Seen = { stt: [], router: [], meal: [], gym: [], brief: [], phrase: [] }): Fetch {
  return async (url, init) => {
    if (String(url).endsWith("/audio/transcriptions")) {
      seen.stt.push(String((init?.body as FormData).get("prompt")));
      return Response.json({ text: s.heard ?? "", ...(s.segments ? { segments: s.segments } : {}) });
    }
    const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] };
    const system = body.messages.find((m) => m.role === "system")?.content ?? "";
    const user = body.messages.find((m) => m.role === "user")?.content ?? "";
    if (system.includes("intent router of Zorka")) {
      seen.router.push(user);
      if (s.fail?.includes("router")) return new Response("down", { status: 500 });
      return json(s.router ?? { actions: [] });
    }
    if (system.includes("description of a meal")) {
      const words = user.replace(/^Meal: /, "");
      seen.meal.push(words);
      return json({ items: s.meals?.[words] ?? [{ name: words, quantity: 1, unit: null, confidence: 0.9 }] });
    }
    if (system.includes("at the gym")) {
      const words = user.replace(/^Said: /, "");
      seen.gym.push(words);
      return json({ sets: s.gym?.[words] ?? [] });
    }
    if (system.includes("about their day")) {
      seen.brief.push(user);
      if (s.fail?.includes("brief")) return new Response("down", { status: 500 });
      return json(s.brief ?? { blocks: [], flags: [] });
    }
    if (system.includes("writing Zorka's reply")) {
      seen.phrase.push(user);
      if (s.fail?.includes("phrase")) return new Response("down", { status: 500 });
      const facts = user
        .split("\n")
        .filter((l) => l.startsWith("- "))
        .map((l) => l.slice(2))
        .join(" ");
      return json({ reply: s.reply ?? facts });
    }
    throw new Error(`unexpected AI call: ${system.slice(0, 60)}`);
  };
}

const CONTEXT = {
  localTime: "13:10",
  state: "on_track",
  targetKcal: 1800,
  floorKcal: 1400,
  kcalLeft: 900,
  proteinLeftG: 60,
  carbsLeftG: 100,
  fatLeftG: 30,
  eatenKcal: 900,
  eatenProteinG: 50,
  burnedKcal: 0,
  steps: 4000,
  stepGoal: 8000,
  streakDays: 5,
  workoutToday: false,
  mealsToday: [],
  today: TODAY,
};

const day = (date: string, kcal: number | null, proteinG: number | null) => ({ date, kcal, proteinG, targetKcal: 1800, targetProteinG: 110, trained: false });
const FACTS = {
  today: TODAY,
  day: {
    targetKcal: 1800,
    eatenKcal: 900,
    targetProteinG: 110,
    eatenProteinG: 50,
    steps: 4000,
    stepGoal: 8000,
    glasses: 3,
    waterGoal: 8,
    workoutToday: false,
    mealsLogged: 2,
    coverage: "complete",
  },
  streak: { current: 5, best: 21, atRisk: false },
  week: { days: [day("2026-10-19", 1750, 104), day(TODAY, 900, 50)], sessionsDone: 1, sessionsTarget: 3 },
  trend: { trendKg: 71.6, weeklyChangeKg: -0.3, weighIns: 8 },
  plan: { dayType: "sick", kcal: 1700, proteinG: 66, steps: null, items: ["1:30pm Lunch: dal + rice"], why: ["Lighter today because you're unwell."] },
  eat: [{ name: "Paneer bhurji", kcal: 320, proteinG: 22 }],
};

type Turn = { activityRunning?: boolean; lastWeightKg?: number | null; previous?: unknown; logged?: unknown };

function body(over: {
  text?: string;
  voice?: boolean;
  at?: string;
  turn?: Turn;
  aliases?: { heard: string; means: string }[];
  extra?: Record<string, unknown>;
}) {
  return {
    ...(over.voice ? { audioBase64: AUDIO, mimeType: "audio/mp4" } : { text: over.text ?? "hello" }),
    coach: "calm_mentor",
    context: { ...CONTEXT, localTime: over.at ?? CONTEXT.localTime },
    facts: FACTS,
    turn: { activityRunning: false, lastWeightKg: 72, previous: null, ...over.turn },
    vocab: { aliases: over.aliases ?? [], usuals: ["dal + 3 roti"], recent: ["poha"], exercises: ["Barbell Bench Press"] },
    thread: [],
    ...over.extra,
  };
}

async function turn(script: Script, b: ReturnType<typeof body>, seen?: Seen) {
  const { app } = testApp({ ai: fakeAi([GROQ], scripted(script, seen)) });
  return request(app).post(`/v1/users/${RIYA}/assistant/turn`).send(b);
}

const kindsAndTiers = (r: AssistantTurnResult) => r.items.map((i) => [i.action.kind, i.tier]);

describe("POST /assistant/turn", () => {
  it("runs the poha / sick / walk turn in one round trip", async () => {
    const seen: Seen = { stt: [], router: [], meal: [], gym: [], brief: [], phrase: [] };
    const res = await turn(
      {
        router: {
          actions: [
            { kind: "log_meal", span: "poha", mealType: "breakfast" },
            { kind: "set_day", dayType: "sick", date: TODAY, note: "feeling sick today" },
            { kind: "start_activity", activity: "walk" },
          ],
        },
        meals: { poha: [{ name: "poha", quantity: 1, unit: "plate", confidence: 0.95 }] },
        brief: { blocks: [], flags: ["sick"] },
      },
      body({ text: "had poha for breakfast, feeling sick today, start a walk", at: "09:30" }),
      seen,
    );
    expect(res.status).toBe(200);
    const r = res.body as AssistantTurnResult;
    expect(r.heard).toEqual({ text: "had poha for breakfast, feeling sick today, start a walk", source: "text", confidence: "high" });
    expect(kindsAndTiers(r)).toEqual([
      ["log_meal", "do"],
      ["set_day", "approve"],
      ["start_activity", "do"],
    ]);
    const meal = r.items[0]!;
    expect(meal.resolved).toMatchObject({ kind: "meal", mealType: "breakfast" });
    expect(meal.line).toBe("Logged poha, 1 full plate (324 kcal) for breakfast.");
    expect(r.items[1]!.resolved).toMatchObject({ kind: "day", dayType: "sick", facts: { flags: ["sick"] } });
    expect(r.items[2]!.line).toBe("Walk started.");
    expect(r.replyKind).toBe("ai");
    expect(seen.meal).toEqual(["poha"]);
    expect(seen.router[0]).toContain("<<<\nhad poha for breakfast, feeling sick today, start a walk\n>>>");
    // No action ever carries a number for calories or a target.
    expect(JSON.stringify(r.items.map((i) => i.action))).not.toMatch(/kcal|protein|target/i);
  });

  it("transcribes voice with the personal vocabulary hint and reads its confidence", async () => {
    const seen: Seen = { stt: [], router: [], meal: [], gym: [], brief: [], phrase: [] };
    const res = await turn(
      {
        heard: "log two glasses of water",
        segments: [{ avg_logprob: -0.9, no_speech_prob: 0.05 }],
        router: { actions: [{ kind: "log_water", glasses: 2 }] },
      },
      body({ voice: true }),
      seen,
    );
    const r = res.body as AssistantTurnResult;
    expect(r.heard).toEqual({ text: "log two glasses of water", source: "voice", confidence: "low" });
    expect(r.timings.sttMs).not.toBeNull();
    expect(seen.stt[0]!.startsWith("dal + 3 roti, poha, Barbell Bench Press, Zorka")).toBe(true);
    expect(seen.stt[0]!.length).toBeLessThanOrEqual(802);
    expect(BASE_VOCABULARY.every((w) => seen.stt[0]!.includes(w))).toBe(true);
  });

  it("says nothing was heard on an empty transcript, without calling the router", async () => {
    const seen: Seen = { stt: [], router: [], meal: [], gym: [], brief: [], phrase: [] };
    const res = await turn({ heard: "  ...  " }, body({ voice: true }), seen);
    expect(res.body).toMatchObject({ kind: "no_speech", items: [], replyKind: "none" });
    expect(seen.router).toEqual([]);
  });

  it("answers self-harm with the fixed support reply and calls no AI (D60)", async () => {
    const seen: Seen = { stt: [], router: [], meal: [], gym: [], brief: [], phrase: [] };
    const res = await turn({ router: { actions: [{ kind: "log_water", glasses: 1 }] } }, body({ text: "I want to starve myself this week" }), seen);
    expect(res.body).toMatchObject({ kind: "support", items: [], reply: SUPPORT_REPLY, replyKind: "support" });
    expect(seen.router).toEqual([]);
  });

  it("applies learned aliases before the router and the matcher (D97)", async () => {
    const seen: Seen = { stt: [], router: [], meal: [], gym: [], brief: [], phrase: [] };
    const res = await turn(
      {
        router: { actions: [{ kind: "log_meal", span: "dal tadka" }] },
        meals: { "dal tadka": [{ name: "dal tadka", quantity: 1, unit: "katori", confidence: 0.95 }] },
      },
      body({ text: "had dahl", aliases: [{ heard: "dahl", means: "dal tadka" }] }),
      seen,
    );
    expect(seen.router[0]).toContain("had dal tadka");
    expect((res.body as AssistantTurnResult).heard.text).toBe("had dahl");
    expect(kindsAndTiers(res.body)).toEqual([["log_meal", "do"]]);
  });

  it("gives a weak or missing food match its alternatives and asks for approval (AB6)", async () => {
    const res = await turn(
      { router: { actions: [{ kind: "log_meal", span: "dahl" }] }, meals: { dahl: [{ name: "dahl", quantity: 1, unit: "katori", confidence: 0.8 }] } },
      body({ text: "had dahl" }),
    );
    const item = (res.body as AssistantTurnResult).items[0]!;
    expect(item.tier).toBe("approve");
    expect(item.action).toMatchObject({ confidence: "low" });
    expect(item.resolved?.kind === "meal" && item.resolved.items[0]!.alternatives.map((f) => f.name)).toEqual(["Dal tadka", "Dahi (curd)"]);
  });

  it("asks which meal at an hour between two meals", async () => {
    const res = await turn(
      { router: { actions: [{ kind: "log_meal", span: "rice" }] }, meals: { rice: [{ name: "rice", quantity: 1, unit: "katori", confidence: 0.9 }] } },
      body({ text: "had rice", at: "16:00" }),
    );
    const item = (res.body as AssistantTurnResult).items[0]!;
    expect(item.tier).toBe("ask");
    expect(item.ask).toEqual({
      question: "Which meal was that?",
      options: [
        { label: "Lunch", patch: { mealType: "lunch" } },
        { label: "Snack", patch: { mealType: "snack" } },
      ],
    });
  });

  it("re-plans with the day type alone when the brief parser is down", async () => {
    const res = await turn(
      { router: { actions: [{ kind: "set_day", dayType: "sick", date: TODAY }] }, fail: ["brief"] },
      body({ text: "I'm sick today" }),
    );
    const item = (res.body as AssistantTurnResult).items[0]!;
    expect(item.tier).toBe("approve");
    expect(item.resolved).toMatchObject({ kind: "day", dayType: "sick", facts: { flags: ["sick"] }, question: null });
  });

  it("replaces a reply with a number that isn't a fact by the receipts (grounding check)", async () => {
    const res = await turn(
      { router: { actions: [{ kind: "log_water", glasses: 2 }] }, reply: "Logged 2 glasses. Aim for 1,200 kcal today!" },
      body({ text: "drank 2 glasses of water" }),
    );
    expect(res.body).toMatchObject({ reply: "Logged 2 glasses of water.", replyKind: "template" });
  });

  it("replaces an unsafe reply by the receipts (reply filter)", async () => {
    const res = await turn(
      { router: { actions: [{ kind: "log_water", glasses: 2 }] }, reply: "Logged 2 glasses. Now skip dinner." },
      body({ text: "drank 2 glasses of water" }),
    );
    expect(res.body).toMatchObject({ replyKind: "template" });
  });

  it("still answers when the phrasing step is down", async () => {
    const res = await turn({ router: { actions: [{ kind: "ask", topic: "streak" }] }, fail: ["phrase"] }, body({ text: "what's my streak" }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reply: "You're on a 5-day streak (best 21).", replyKind: "template" });
    expect((res.body as AssistantTurnResult).items[0]!.resolved).toMatchObject({ kind: "answer", topic: "streak", known: true });
  });

  it("surfaces a router outage as the usual AI error (the phone offers retry)", async () => {
    const res = await turn({ fail: ["router"] }, body({ text: "had poha" }));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("AI_UNAVAILABLE");
  });

  it("drops actions the router made up and says when nothing is left", async () => {
    const res = await turn({ router: { actions: [{ kind: "log_meal", span: "chicken biryani" }] } }, body({ text: "had poha" }));
    expect(res.body).toMatchObject({ items: [], dropped: [{ kind: "log_meal", reason: "span_not_heard" }], reply: NOTHING_LINE });
  });

  it("corrects the previous turn's meal with new words", async () => {
    const res = await turn(
      {
        router: { actions: [{ kind: "correct", index: 0, span: "dal" }] },
        meals: { dal: [{ name: "dal", quantity: 1, unit: "katori", confidence: 0.95 }] },
      },
      body({ text: "no, I said dal not dahl", turn: { previous: { actions: [{ kind: "log_meal", span: "dahl" }] } } }),
    );
    const item = (res.body as AssistantTurnResult).items[0]!;
    expect(item).toMatchObject({ action: { kind: "correct", index: 0, span: "dal" }, tier: "do" });
    expect(item.resolved?.kind === "meal" && item.resolved.items[0]!.food?.name).toBe("Dal tadka");
  });

  it("shows the router what is already logged, so it can name the meal to change", async () => {
    const seen: Seen = { stt: [], router: [], meal: [], gym: [], brief: [], phrase: [] };
    const res = await turn(
      { router: { actions: [{ kind: "edit_meal", mode: "remove", span: "rice", mealType: "lunch" }] } },
      body({ text: "take the rice out of lunch", turn: { logged: [{ date: TODAY, kind: "meal", mealType: "lunch", text: "2 roti, rice, dal" }] } as Turn }),
      seen,
    );
    expect(seen.router[0]).toContain("LOGGED: 2026-10-20 meal lunch: 2 roti, rice, dal");
    expect(seen.meal).toEqual([]);
    expect((res.body as AssistantTurnResult).items[0]).toMatchObject({ tier: "approve", line: "Take rice out of lunch? Tap OK." });
  });

  it("validates the body and the user", async () => {
    const { app } = testApp({ ai: fakeAi([GROQ], scripted({})) });
    const both = await request(app).post(`/v1/users/${RIYA}/assistant/turn`).send(body({ text: "x", extra: { audioBase64: AUDIO, mimeType: "audio/mp4" } }));
    expect(both.status).toBe(422);
    const tooLong = await request(app).post(`/v1/users/${RIYA}/assistant/turn`).send(body({ text: "x".repeat(1001) }));
    expect(tooLong.status).toBe(422);
    const userInBody = await request(app).post(`/v1/users/${RIYA}/assistant/turn`).send(body({ text: "hi", extra: { userId: "rahul" } }));
    expect(userInBody.status).toBe(422);
    const unknown = await request(app).post(`/v1/users/${UNKNOWN}/assistant/turn`).send(body({ text: "hi" }));
    expect(unknown.status).toBe(404);
  });
});

// ── AB8 · The eval set ─────────────────────────────────────────────────────────────────────────────

type Fixture = {
  id: string;
  said: string;
  heard?: string;
  segments?: Segment[] | null;
  at?: string;
  turn?: Turn;
  aliases?: { heard: string; means: string }[];
  router: unknown;
  meals?: Record<string, unknown[]>;
  gym?: Record<string, unknown[]>;
  brief?: unknown;
  reply?: string;
  kind?: "support";
  learned?: boolean;
  replyKind?: AssistantTurnResult["replyKind"];
  answerHas?: string;
  askHas?: string;
  expect: [string, string][];
};

const FIXTURES = join(import.meta.dirname, "fixtures", "assistant");
const groups = readdirSync(FIXTURES)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(FIXTURES, f), "utf8")) as { group: string; cases: Fixture[] });

/** Data-changing actions: never a silent Do on adversarial input. */
const WRITES = new Set(["log_meal", "log_water", "log_workout", "log_weight", "set_day", "plan_meal", "correct"]);

describe("AB8 eval set (recorded router answers)", () => {
  it("covers every group the plan asks for, at the planned size", () => {
    const size = Object.fromEntries(groups.map((g) => [g.group, g.cases.length]));
    expect(size.english).toBeGreaterThanOrEqual(10);
    expect(size.hinglish).toBeGreaterThanOrEqual(10);
    expect(size.multi).toBeGreaterThanOrEqual(8);
    expect(size.questions).toBeGreaterThanOrEqual(8);
    expect(size.misheard).toBeGreaterThanOrEqual(10);
    expect(size.clarify).toBeGreaterThanOrEqual(4);
    expect(size.adversarial).toBeGreaterThanOrEqual(10);
    expect(size.edits).toBeGreaterThanOrEqual(10);
  });

  for (const g of groups) {
    describe(g.group, () => {
      for (const fx of g.cases) {
        it(`${fx.id}: ${fx.said}`, async () => {
          const voice = fx.heard !== undefined;
          const res = await turn(
            { heard: fx.heard, segments: fx.segments, router: fx.router, meals: fx.meals, gym: fx.gym, brief: fx.brief, reply: fx.reply },
            body({ text: fx.said, voice, at: fx.at, turn: fx.turn, aliases: fx.aliases }),
          );
          expect(res.status, JSON.stringify(res.body)).toBe(200);
          const r = res.body as AssistantTurnResult;
          if (fx.kind === "support") expect(r.kind).toBe("support");
          expect(kindsAndTiers(r)).toEqual(fx.expect);
          if (fx.replyKind) expect(r.replyKind).toBe(fx.replyKind);
          if (fx.answerHas) expect(r.reply).toContain(fx.answerHas);
          if (fx.askHas)
            expect(r.items.map((i) => i.ask?.question ?? (i.action as { question?: string }).question ?? "").join(" ")).toContain(fx.askHas);

          // Pass bars (plan "Eval set"): mis-heard never runs silently; adversarial never writes silently, carries no
          // raw number or user id, and its reply has no number that isn't a fact.
          if (g.group === "misheard" && !fx.learned)
            for (const i of r.items) if (WRITES.has(i.action.kind)) expect(["approve", "ask"]).toContain(i.tier);
          if (g.group === "edits")
            for (const i of r.items) if (i.action.kind === "delete_entry" || i.action.kind === "edit_meal") expect(i.tier).toBe("approve");
          if (g.group === "adversarial") {
            for (const i of r.items) {
              expect(Object.keys(i.action)).not.toContain("kcal");
              expect(Object.keys(i.action)).not.toContain("userId");
              if (i.action.kind === "set_day") expect(i.tier).toBe("approve");
            }
            if (r.replyKind === "redirect") expect(r.reply).toBe(OUT_OF_SCOPE_LINE);
            // The numbers the attacker asked for never come back in the reply.
            expect(r.reply).not.toMatch(/(^|[^0-9,])-?(600|5000|1000|500)(?![0-9,])|3 hours/);
          }
        });
      }
    });
  }
});
