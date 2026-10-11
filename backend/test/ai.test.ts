// P14 AI client: fallback across slots, cooldowns, clean errors, JSON extraction. No real network.
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { extractJson } from "../src/modules/ai/ai.client.js";
import type { AiSlot } from "../src/modules/ai/ai.config.js";
import type { Fetch } from "../src/modules/ai/providers.js";
import { fakeAi, testApp } from "./fakes.js";

const slot = (provider: AiSlot["provider"], n: number): AiSlot => ({
  id: `${provider}#${n}`,
  provider,
  apiKey: `key-${provider}-${n}`,
  models: {
    text: [`${provider}-text`],
    vision: [`${provider}-vision`],
    ...(provider === "openrouter" ? {} : { stt: [`${provider}-stt`] }),
  },
});

const reply = (content: string) =>
  new Response(JSON.stringify({ model: "m", choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

/** A fake network: answers per API key, records which keys were used. */
function network(byKey: Record<string, () => Response | Promise<Response>>) {
  const calls: string[] = [];
  const fetchImpl: Fetch = async (_url, init) => {
    const auth = new Headers(init?.headers).get("authorization") ?? new Headers(init?.headers).get("x-goog-api-key") ?? "";
    const key = auth.replace(/^Bearer /, "");
    calls.push(key);
    const handler = byKey[key];
    if (!handler) throw new Error(`unexpected key ${key}`);
    return handler();
  };
  return { fetchImpl, calls };
}

describe("AI client fallback (P14)", () => {
  it("uses the first slot when it works", async () => {
    const net = network({ "key-groq-1": () => reply("hello") });
    const ai = fakeAi([slot("groq", 1), slot("gemini", 1)], net.fetchImpl);
    const r = await ai.chat({ user: "hi" });
    expect(r.text).toBe("hello");
    expect(r.meta).toMatchObject({ slot: "groq#1", attempts: 1 });
  });

  it("falls through a rate-limited key to the next account, then cools it down", async () => {
    let t = 1_000_000;
    const net = network({
      "key-groq-1": () => new Response("slow down", { status: 429, headers: { "retry-after": "30" } }),
      "key-groq-2": () => reply("from groq 2"),
    });
    const ai = fakeAi([slot("groq", 1), slot("groq", 2)], net.fetchImpl, () => t);
    expect((await ai.chat({ user: "a" })).meta.slot).toBe("groq#2");
    // Within the cooldown, groq#1 isn't even tried.
    await ai.chat({ user: "b" });
    expect(net.calls).toEqual(["key-groq-1", "key-groq-2", "key-groq-2"]);
    expect(ai.status().slots[0]).toMatchObject({ id: "groq#1", failures: { rate_limit: 1 }, coolingDownForMs: 30_000 });
    // After it, groq#1 is tried first again (still limited here, so groq#2 answers).
    t += 31_000;
    await ai.chat({ user: "c" });
    expect(net.calls.slice(3)).toEqual(["key-groq-1", "key-groq-2"]);
  });

  it("moves across providers on server errors and bad keys", async () => {
    const net = network({
      "key-groq-1": () => new Response("boom", { status: 500 }),
      "key-gemini-1": () => new Response("bad key", { status: 401 }),
      "key-openrouter-1": () => reply("ok from openrouter"),
    });
    const ai = fakeAi([slot("groq", 1), slot("gemini", 1), slot("openrouter", 1)], net.fetchImpl);
    const r = await ai.chat({ user: "x" });
    expect(r.meta).toMatchObject({ slot: "openrouter#1", attempts: 3 });
  });

  it("gives a clean 429 when every key is rate-limited", async () => {
    const net = network({
      "key-groq-1": () => new Response("", { status: 429 }),
      "key-gemini-1": () => new Response("RESOURCE_EXHAUSTED", { status: 429 }),
    });
    const { app } = testApp({ ai: fakeAi([slot("groq", 1), slot("gemini", 1)], net.fetchImpl) });
    const res = await request(app).post("/v1/dev/ai/chat").send({ prompt: "hi" });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(res.body.error.message).toMatch(/free-tier limit/);
  });

  it("gives a clean 504 on timeouts", async () => {
    const hang: Fetch = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    const ai = fakeAi([slot("groq", 1)], hang);
    // Shrink the wait: the client times out per TIMEOUTS_MS, so run with fake timers.
    const { vi } = await import("vitest");
    vi.useFakeTimers();
    try {
      const p = ai.chat({ user: "x" }).catch((e) => e);
      await vi.advanceTimersByTimeAsync(25_000);
      const err = await p;
      expect(err).toMatchObject({ code: "AI_TIMEOUT", status: 504 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("says AI isn't set up when there are no keys", async () => {
    const res = await request(testApp().app).post("/v1/dev/ai/chat").send({ prompt: "hi" });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatchObject({ code: "AI_UNAVAILABLE", details: { reason: "not_configured" } });
  });

  it("skips a slot whose JSON doesn't match the schema", async () => {
    const net = network({ "key-groq-1": () => reply("sorry, I can't"), "key-groq-2": () => reply('```json\n{"n": 2}\n```') });
    const ai = fakeAi([slot("groq", 1), slot("groq", 2)], net.fetchImpl);
    const r = await ai.json({ system: "s", user: "u", schema: z.object({ n: z.number() }) });
    expect(r.value).toEqual({ n: 2 });
    expect(r.meta.slot).toBe("groq#2");
  });

  it("never exposes keys in the status endpoint", async () => {
    const { app } = testApp({ ai: fakeAi([slot("groq", 1)], network({}).fetchImpl) });
    const res = await request(app).get("/v1/dev/ai/status");
    expect(res.body.slots[0]).toMatchObject({ id: "groq#1", provider: "groq" });
    expect(JSON.stringify(res.body)).not.toContain("key-groq-1");
  });
});

describe("model lists per key (retired models)", () => {
  it("a 404 model falls through to the next model on the same key, and only that model cools down", async () => {
    const seen: string[] = [];
    const fetchImpl: Fetch = async (url, init) => {
      if (String(url).endsWith("/audio/transcriptions")) return Response.json({ text: "2 roti" });
      const model = JSON.parse(String(init?.body)).model as string;
      seen.push(model);
      return model === "retired" ? new Response("model_decommissioned", { status: 404 }) : reply("ok");
    };
    const s: AiSlot = { id: "groq#1", provider: "groq", apiKey: "k", models: { text: ["retired", "current"], stt: ["whisper"] } };
    const ai = fakeAi([s], fetchImpl);
    expect((await ai.chat({ user: "a" })).meta).toMatchObject({ slot: "groq#1", model: "m", attempts: 2 });
    await ai.chat({ user: "b" });
    expect(seen).toEqual(["retired", "current", "current"]);
    // The key itself isn't cooling down: speech-to-text on it still works.
    expect((await ai.transcribe({ base64: "AAAA", mimeType: "audio/mp4" }, "")).text).toBe("2 roti");
  });

  it("sends low reasoning effort to gpt-oss and hides Qwen reasoning", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl: Fetch = async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return reply('<think>maybe {x}</think>{"n":1}');
    };
    const s: AiSlot = {
      id: "groq#1",
      provider: "groq",
      apiKey: "k",
      models: { text: ["openai/gpt-oss-120b"], vision: ["qwen/qwen3.8-27b"] },
    };
    const ai = fakeAi([s], fetchImpl);
    expect((await ai.json({ system: "s", user: "u", schema: z.object({ n: z.number() }) })).value).toEqual({ n: 1 });
    await ai.json({ system: "s", user: "u", image: { base64: "B", mimeType: "image/jpeg" }, schema: z.object({ n: z.number() }) });
    expect(bodies[0]).toMatchObject({ reasoning_effort: "low", response_format: { type: "json_object" } });
    expect(bodies[1]).toMatchObject({ reasoning_format: "hidden" });
  });
});

describe("extractJson", () => {
  it("handles fences and chatter", () => {
    expect(extractJson('Sure! {"a":1} hope that helps')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":[1,2]}\n```')).toEqual({ a: [1, 2] });
    expect(() => extractJson("no json here")).toThrow();
  });
});
