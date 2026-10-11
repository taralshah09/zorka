// P19 curated exercise list (prisma/data/exercises.ts) and P22 matching against it.
import { describe, expect, it } from "vitest";

import { EXERCISE_SOURCE, EXERCISES } from "../prisma/data/exercises.js";
import { curatedExerciseId, exercisesFromRows } from "../src/modules/exercises/catalog.js";
import type { ExerciseRecord } from "../src/modules/exercises/exercises.repository.js";
import { matchExercise } from "../src/modules/gymParse/gymParse.service.js";
import { normalize } from "../../shared/domain/foodMatch.js";
import { EXERCISE_CATEGORIES } from "../../shared/domain/gym.js";

const catalog: ExerciseRecord[] = exercisesFromRows(EXERCISES).map(({ slug: _s, ...e }) => ({
  ...e,
  source: EXERCISE_SOURCE,
  custom: false,
  ownerUserId: null,
  clientUpdatedAt: null,
  deletedAt: null,
  updatedAt: new Date(0),
}));
const byName = (name: string) => catalog.find((e) => e.name === name)!;
const match = (q: string, prefer: string[] = []) => matchExercise(q, catalog, new Set(prefer))?.exercise.name ?? null;

describe("curated exercise list (D38)", () => {
  it("has ~110 FitNotes-style exercises across all 8 categories", () => {
    expect(catalog.length).toBeGreaterThanOrEqual(100);
    for (const c of EXERCISE_CATEGORIES) expect(catalog.some((e) => e.category === c)).toBe(true);
  });

  it("every exercise links to its MuscleWiki page", () => {
    for (const e of catalog) expect(e.referenceUrl).toMatch(/^https:\/\/musclewiki\.com\/exercise\/[a-z0-9-]+$/);
  });

  it("ids are stable UUIDs from the slug", () => {
    expect(byName("Barbell Bench Press").id).toBe(curatedExerciseId("barbell-bench-press"));
    expect(curatedExerciseId("barbell-bench-press")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("no alias points at two exercises (voice matching stays predictable)", () => {
    const seen = new Map<string, string>();
    for (const e of catalog) {
      for (const label of [e.name, ...e.aliases]) {
        const k = normalize(label);
        expect(seen.get(k) ?? e.name, `"${label}"`).toBe(e.name);
        seen.set(k, e.name);
      }
    }
  });

  it("rejects bad rows", () => {
    expect(() => exercisesFromRows([EXERCISES[0]!, EXERCISES[0]!])).toThrow(/Duplicate/);
  });
});

describe("matching what people say (P22)", () => {
  it.each([
    ["bench", "Barbell Bench Press"],
    ["bench press", "Barbell Bench Press"],
    ["squats", "Barbell Back Squat"],
    ["deadlift", "Barbell Deadlift"],
    ["rdl", "Romanian Deadlift"],
    ["ohp", "Barbell Overhead Press"],
    ["pull ups", "Pull-Up"],
    ["lat pulldown", "Lat Pulldown"],
    ["incline dumbbell press", "Incline Dumbbell Bench Press"],
    ["hammer curls", "Hammer Curl"],
    ["plank", "Plank"],
    ["skipping", "Jump Rope"],
  ])("%s → %s", (said, expected) => {
    expect(match(said)).toBe(expected);
  });

  it("prefers an exercise already in the workout when the name is ambiguous", () => {
    expect(match("incline press")).toBe("Incline Barbell Bench Press");
    const incline = byName("Incline Dumbbell Bench Press").id;
    expect(match("incline press", [incline])).toBe("Incline Dumbbell Bench Press");
    // A clear name for a different exercise still wins over the one in the workout.
    expect(match("dumbbell press", [byName("Barbell Bench Press").id])).toBe("Dumbbell Bench Press");
  });

  it("returns nothing for words that aren't exercises", () => {
    expect(match("banana")).toBeNull();
  });
});
