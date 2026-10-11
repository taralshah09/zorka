// P19–P22 gym API: exercise catalog, custom exercises, workout + routine sync, voice gym entry (AI faked).
import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { curatedExerciseId } from "../src/modules/exercises/catalog.js";
import type { AiSlot } from "../src/modules/ai/ai.config.js";
import type { Fetch } from "../src/modules/ai/providers.js";
import { ARJUN, RIYA, UNKNOWN, fakeAi, testApp } from "./fakes.js";

const BENCH = curatedExerciseId("barbell-bench-press");
const INCLINE_DB = curatedExerciseId("incline-dumbbell-bench-press");
const PLANK = curatedExerciseId("plank");

const op = (entity: string, data: unknown, over: Record<string, unknown> = {}) => ({
  opId: randomUUID(),
  entity,
  action: "upsert",
  id: randomUUID(),
  clientUpdatedAt: "2026-10-11T10:00:00.000Z",
  data,
  ...over,
});

const sync = (app: Parameters<typeof request>[0], userId: string, ops: unknown[]) =>
  request(app).post(`/v1/users/${userId}/sync`).send({ ops });

const set = (weightKg: number | null, reps: number | null, extra: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  weightKg,
  reps,
  completedAt: "2026-10-11T09:20:00.000Z",
  ...extra,
});

const workout = (over: Record<string, unknown> = {}) => ({
  name: "Push day",
  startedAt: "2026-10-11T09:00:00.000+05:30",
  endedAt: "2026-10-11T10:02:00.000+05:30",
  localDate: "2026-10-11",
  exercises: [
    {
      id: randomUUID(),
      exerciseId: BENCH,
      name: "Barbell Bench Press",
      type: "weight_reps",
      sets: [set(75, 8), set(77.5, 8), set(80, 8, { prKinds: ["weight", "e1rm"] })],
    },
    {
      id: randomUUID(),
      exerciseId: PLANK,
      name: "Plank",
      type: "time",
      sets: [{ id: randomUUID(), durationS: 60 }],
    },
  ],
  ...over,
});

describe("GET /users/:id/exercises/catalog (P19)", () => {
  it("returns the curated list with MuscleWiki links, plus the user's own exercises only", async () => {
    const { app } = testApp();
    await sync(app, ARJUN, [op("custom_exercise", { name: "Arjun's press", category: "chest", type: "weight_reps" })]);
    const res = await request(app).get(`/v1/users/${RIYA}/exercises/catalog`);
    expect(res.status).toBe(200);
    const bench = res.body.exercises.find((e: { id: string }) => e.id === BENCH);
    expect(bench).toMatchObject({
      name: "Barbell Bench Press",
      category: "chest",
      type: "weight_reps",
      referenceUrl: "https://musclewiki.com/exercise/barbell-bench-press",
      custom: false,
    });
    expect(res.body.exercises.some((e: { name: string }) => e.name === "Arjun's press")).toBe(false);
  });

  it("404s for an unknown user", async () => {
    const { app } = testApp();
    expect((await request(app).get(`/v1/users/${UNKNOWN}/exercises/catalog`)).status).toBe(404);
  });
});

describe("custom_exercise sync (P19)", () => {
  it("creates an exercise with a cleaned MuscleWiki link, visible in the user's catalog", async () => {
    const { app, exercises } = testApp();
    const o = op("custom_exercise", {
      name: "Landmine press",
      category: "shoulders",
      type: "weight_reps",
      referenceUrl: "musclewiki.com/exercise/landmine-overhead-press?ref=app",
    });
    const res = await sync(app, RIYA, [o]);
    expect(res.body.results[0].status).toBe("applied");
    expect(exercises.rows.get(o.id)).toMatchObject({
      custom: true,
      ownerUserId: RIYA,
      referenceUrl: "https://musclewiki.com/exercise/landmine-overhead-press",
    });
    const cat = await request(app).get(`/v1/users/${RIYA}/exercises/catalog`);
    expect(cat.body.exercises.some((e: { id: string }) => e.id === o.id)).toBe(true);
  });

  it("refuses links to other sites", async () => {
    const { app } = testApp();
    const res = await sync(app, RIYA, [
      op("custom_exercise", { name: "X", category: "abs", type: "reps", referenceUrl: "https://example.com/x" }),
    ]);
    expect(res.body.results[0]).toMatchObject({ status: "rejected" });
    expect(res.body.results[0].message).toMatch(/musclewiki/);
  });

  it("curated exercises can't be changed; deleting your own hides it", async () => {
    const { app } = testApp();
    const bad = await sync(app, RIYA, [op("custom_exercise", { name: "Hack", category: "chest", type: "reps" }, { id: BENCH })]);
    expect(bad.body.results[0].status).toBe("rejected");

    const id = randomUUID();
    await sync(app, RIYA, [op("custom_exercise", { name: "Mine", category: "abs", type: "reps" }, { id })]);
    await sync(app, RIYA, [op("custom_exercise", undefined, { id, action: "delete", clientUpdatedAt: "2026-10-11T11:00:00.000Z" })]);
    const cat = await request(app).get(`/v1/users/${RIYA}/exercises/catalog`);
    expect(cat.body.exercises.some((e: { id: string }) => e.id === id)).toBe(false);
  });
});

describe("workout sync (P19/P20)", () => {
  it("stores a finished workout with its sets and PR kinds, and lists it", async () => {
    const { app, workouts } = testApp();
    const o = op("workout", workout());
    const res = await sync(app, RIYA, [o]);
    expect(res.body.results[0].status).toBe("applied");
    const stored = workouts.rows.get(o.id)!;
    expect(stored.exercises[0]!.sets.map((s) => s.prKinds)).toEqual([[], [], ["weight", "e1rm"]]);

    const list = await request(app).get(`/v1/users/${RIYA}/workouts`);
    expect(list.body.workouts).toHaveLength(1);
    expect(list.body.workouts[0]).toMatchObject({ id: o.id, name: "Push day", routineId: null });
    expect(list.body.workouts[0].exercises[1].sets[0]).toMatchObject({ durationS: 60, weightKg: null });
  });

  it("an unknown exercise id (e.g. a rejected custom exercise) is kept as a name-only snapshot", async () => {
    const { app, workouts } = testApp();
    const w = workout();
    (w.exercises[0] as { exerciseId: string }).exerciseId = randomUUID();
    const o = op("workout", w);
    await sync(app, RIYA, [o]);
    expect(workouts.rows.get(o.id)!.exercises[0]).toMatchObject({ exerciseId: null, name: "Barbell Bench Press" });
  });

  it("rejects sets missing values for their type, and an end before the start", async () => {
    const { app } = testApp();
    const noReps = workout();
    noReps.exercises[0]!.sets = [set(80, null)];
    const backwards = workout({ endedAt: "2026-10-11T08:00:00.000+05:30" });
    const res = await sync(app, RIYA, [op("workout", noReps), op("workout", backwards)]);
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual(["rejected", "rejected"]);
  });

  it("last write wins, and a delete hides it", async () => {
    const { app } = testApp();
    const id = randomUUID();
    await sync(app, RIYA, [op("workout", workout({ name: "Newer" }), { id, clientUpdatedAt: "2026-10-11T12:00:00.000Z" })]);
    const stale = await sync(app, RIYA, [op("workout", workout({ name: "Older" }), { id })]);
    expect(stale.body.results[0].status).toBe("stale");
    await sync(app, RIYA, [op("workout", undefined, { id, action: "delete", clientUpdatedAt: "2026-10-11T13:00:00.000Z" })]);
    expect((await request(app).get(`/v1/users/${RIYA}/workouts`)).body.workouts).toEqual([]);
  });

  it("never lets one user overwrite another's workout", async () => {
    const { app } = testApp();
    const id = randomUUID();
    await sync(app, RIYA, [op("workout", workout(), { id })]);
    const res = await sync(app, ARJUN, [op("workout", workout(), { id, clientUpdatedAt: "2026-10-12T00:00:00.000Z" })]);
    expect(res.body.results[0].status).toBe("rejected");
  });
});

describe("routine sync (P21)", () => {
  const routine = {
    name: "Push day",
    exercises: [
      { id: randomUUID(), exerciseId: BENCH, name: "Barbell Bench Press", type: "weight_reps", targetSets: 4, targetReps: 8 },
      { id: randomUUID(), exerciseId: PLANK, name: "Plank", type: "time", targetSets: 3 },
    ],
  };

  it("stores and lists a routine; a workout started from it keeps the link", async () => {
    const { app, workouts } = testApp();
    const r = op("routine", routine);
    expect((await sync(app, RIYA, [r])).body.results[0].status).toBe("applied");
    const list = await request(app).get(`/v1/users/${RIYA}/routines`);
    expect(list.body.routines).toHaveLength(1);
    expect(list.body.routines[0].exercises.map((e: { targetSets: number; targetReps: number | null }) => [e.targetSets, e.targetReps])).toEqual([
      [4, 8],
      [3, null],
    ]);

    const w = op("workout", workout({ routineId: r.id }));
    await sync(app, RIYA, [w]);
    expect(workouts.rows.get(w.id)!.routineId).toBe(r.id);
  });

  it("a workout pointing at an unknown routine is kept, unlinked", async () => {
    const { app, workouts } = testApp();
    const w = op("workout", workout({ routineId: randomUUID() }));
    await sync(app, RIYA, [w]);
    expect(workouts.rows.get(w.id)!.routineId).toBeNull();
  });

  it("validates targets", async () => {
    const { app } = testApp();
    const bad = { ...routine, exercises: [{ ...routine.exercises[0], targetSets: 0 }] };
    expect((await sync(app, RIYA, [op("routine", bad)])).body.results[0].status).toBe("rejected");
  });
});

describe("POST /workouts/parse-voice (P22)", () => {
  const GROQ: AiSlot = { id: "groq#1", provider: "groq", apiKey: "k", models: { text: ["t"], vision: ["v"], stt: ["w"] } };
  const audio = { audioBase64: "A".repeat(400), mimeType: "audio/mp4" };

  /** Fake Groq: Whisper returns `transcript`; chat returns `sets`. */
  function groq(sets: unknown[], transcript: string): Fetch {
    return async (url) => {
      if (String(url).endsWith("/audio/transcriptions")) return Response.json({ text: transcript });
      return Response.json({ model: "t", choices: [{ message: { content: JSON.stringify({ sets }) } }] });
    };
  }

  it("mid-workout: 'bench 80 kilos, 8 reps' becomes one bench press set", async () => {
    const ai = fakeAi([GROQ], groq([{ exercise: "bench press", weight: 80, unit: "kg", reps: 8, sets: 1, confidence: 0.95 }], "bench 80 kilos, 8 reps"));
    const { app } = testApp({ ai });
    const res = await request(app)
      .post(`/v1/users/${RIYA}/workouts/parse-voice`)
      .send({ ...audio, preferExerciseIds: [BENCH] });
    expect(res.status).toBe(200);
    expect(res.body.transcript).toBe("bench 80 kilos, 8 reps");
    expect(res.body.sets).toHaveLength(1);
    expect(res.body.sets[0]).toMatchObject({
      exercise: { id: BENCH, name: "Barbell Bench Press" },
      values: { weightKg: 80, reps: 8, durationS: null, distanceM: null },
      count: 1,
      uncertain: false,
    });
    expect(res.body.timings.sttMs).toBeGreaterThanOrEqual(0);
  });

  it("uses the exercise already in the workout, converts pounds, keeps the set count", async () => {
    const ai = fakeAi(
      [GROQ],
      groq([{ exercise: "incline press", weight: 50, unit: "lb", reps: 10, sets: 3, confidence: 0.9 }], "incline press 50 pounds 3 sets of 10"),
    );
    const { app } = testApp({ ai });
    const res = await request(app)
      .post(`/v1/users/${RIYA}/workouts/parse-voice`)
      .send({ ...audio, preferExerciseIds: [INCLINE_DB] });
    expect(res.body.sets[0]).toMatchObject({ exercise: { id: INCLINE_DB }, values: { weightKg: 22.7, reps: 10 }, count: 3 });
  });

  it("flags what it can't use: unknown exercise, missing numbers, low confidence", async () => {
    const ai = fakeAi(
      [GROQ],
      groq(
        [
          { exercise: "zumba twirl", weight: null, unit: null, reps: 10, confidence: 0.9 },
          { exercise: "bench press", weight: 80, unit: "kg", reps: null, confidence: 0.9 },
          { exercise: "squat", weight: 100, unit: "kg", reps: 5, confidence: 0.4 },
          { exercise: "pull ups", weight: null, unit: null, reps: 10, confidence: 0.9 },
        ],
        "zumba twirl 10, bench 80, squat 100 for 5, pull ups 10",
      ),
    );
    const { app } = testApp({ ai });
    const res = await request(app).post(`/v1/users/${RIYA}/workouts/parse-voice`).send(audio);
    expect(res.body.sets.map((s: { reasons: string[] }) => s.reasons)).toEqual([
      ["no_match"],
      ["missing_values"],
      ["low_confidence"],
      [],
    ]);
    // Pull-ups with no weight said = bodyweight.
    expect(res.body.sets[3].values).toMatchObject({ weightKg: 0, reps: 10 });
  });

  it("returns no sets when no speech was detected", async () => {
    const { app } = testApp({ ai: fakeAi([GROQ], groq([], " ")) });
    const res = await request(app).post(`/v1/users/${RIYA}/workouts/parse-voice`).send(audio);
    expect(res.body).toMatchObject({ transcript: "", sets: [] });
  });

  it("takes voice-sized bodies; 503 with no AI keys so the phone offers typed entry", async () => {
    const { app } = testApp({ ai: fakeAi([GROQ], groq([], "")) });
    const big = await request(app)
      .post(`/v1/users/${RIYA}/workouts/parse-voice`)
      .send({ ...audio, audioBase64: "A".repeat(600_000) });
    expect(big.status).toBe(200);

    const noKeys = testApp();
    const res = await request(noKeys.app).post(`/v1/users/${RIYA}/workouts/parse-voice`).send(audio);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("AI_UNAVAILABLE");
  });
});
