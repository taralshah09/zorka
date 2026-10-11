// P19–P20 gym domain logic (shared/domain/gym.ts): sets, Epley e1RM, PR rules (D39), MuscleWiki links.
import { describe, expect, it } from "vitest";

import {
  addToBests,
  bestsOf,
  clampRest,
  cleanMusclewikiUrl,
  e1rm,
  formatClock,
  formatSet,
  isSetComplete,
  lbToKg,
  NO_BESTS,
  prKinds,
  prsForSequence,
  setVolume,
  topSet,
  valuesFor,
  type SetValues,
} from "../../shared/domain/gym.js";

const wr = (weightKg: number, reps: number): SetValues => ({ weightKg, reps, durationS: null, distanceM: null });
const done = (s: SetValues) => ({ ...s, done: true });

describe("sets", () => {
  it("knows which values each type needs", () => {
    expect(isSetComplete("weight_reps", wr(80, 8))).toBe(true);
    expect(isSetComplete("weight_reps", wr(0, 10))).toBe(true); // bodyweight pull-ups
    expect(isSetComplete("weight_reps", { ...wr(80, 8), reps: null })).toBe(false);
    expect(isSetComplete("reps", { ...wr(0, 0), reps: 20 })).toBe(true);
    expect(isSetComplete("time", { weightKg: null, reps: null, durationS: 60, distanceM: null })).toBe(true);
    expect(isSetComplete("distance_time", { weightKg: null, reps: null, durationS: 600, distanceM: null })).toBe(false);
  });

  it("drops values the type doesn't use", () => {
    expect(valuesFor("reps", wr(80, 8))).toEqual({ weightKg: null, reps: 8, durationS: null, distanceM: null });
  });

  it("Epley e1RM; one rep is the weight itself", () => {
    expect(e1rm(80, 8)).toBe(101.3);
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(0, 10)).toBeNull();
  });

  it("volume is kg × reps for weighted sets only", () => {
    expect(setVolume("weight_reps", wr(80, 8))).toBe(640);
    expect(setVolume("reps", { ...wr(0, 0), reps: 20 })).toBe(0);
  });

  it("formats sets for the Previous column and history", () => {
    expect(formatSet("weight_reps", wr(77.5, 8))).toBe("77.5 × 8");
    expect(formatSet("weight_reps", wr(0, 12))).toBe("12 reps");
    expect(formatSet("time", { weightKg: null, reps: null, durationS: 90, distanceM: null })).toBe("1:30");
    expect(formatSet("distance_time", { weightKg: null, reps: null, durationS: 840, distanceM: 2500 })).toBe("2.5 km · 14:00");
    expect(formatClock(3725)).toBe("1:02:05");
  });

  it("top set is the heaviest, then most reps", () => {
    expect(topSet("weight_reps", [wr(70, 10), wr(80, 5), wr(80, 6)])).toEqual(wr(80, 6));
  });
});

describe("PR detection (D39)", () => {
  it("mid-workout scenario: 80 × 8 after a best of 77.5 × 8 is a weight and e1RM PR", () => {
    const history = bestsOf("weight_reps", [wr(70, 10), wr(77.5, 8), wr(77.5, 7)]);
    expect(prKinds("weight_reps", wr(80, 8), history)).toEqual(["weight", "e1rm"]);
  });

  it("more reps at a lighter weight can be an e1RM PR without a weight PR", () => {
    const history = bestsOf("weight_reps", [wr(80, 5)]); // e1RM 93.3
    expect(prKinds("weight_reps", wr(75, 12), history)).toEqual(["e1rm"]); // e1RM 105
  });

  it("matching the best is not a PR", () => {
    const history = bestsOf("weight_reps", [wr(80, 8)]);
    expect(prKinds("weight_reps", wr(80, 8), history)).toEqual([]);
  });

  it("no history, no PR (a first session doesn't light up every set)", () => {
    expect(prKinds("weight_reps", wr(80, 8), NO_BESTS)).toEqual([]);
  });

  it("bodyweight sets compare reps; the first weighted set after them is a weight PR", () => {
    const history = bestsOf("weight_reps", [wr(0, 8)]);
    expect(prKinds("weight_reps", wr(0, 10), history)).toEqual(["reps"]);
    expect(prKinds("weight_reps", wr(5, 6), history)).toEqual(["weight"]);
  });

  it("reps-only, time and distance types", () => {
    const reps = { weightKg: null, reps: 30, durationS: null, distanceM: null };
    expect(prKinds("reps", reps, addToBests(NO_BESTS, "reps", { ...reps, reps: 25 }))).toEqual(["reps"]);
    const hold = { weightKg: null, reps: null, durationS: 95, distanceM: null };
    expect(prKinds("time", hold, addToBests(NO_BESTS, "time", { ...hold, durationS: 90 }))).toEqual(["time"]);
    const run = { weightKg: null, reps: null, durationS: 900, distanceM: 3000 };
    expect(prKinds("distance_time", run, addToBests(NO_BESTS, "distance_time", { ...run, distanceM: 2500 }))).toEqual([
      "distance",
    ]);
  });

  it("within a workout: set 3 beats sets 1-2 and the history; unticked sets never count", () => {
    const history = bestsOf("weight_reps", [wr(77.5, 8)]);
    const sets = [done(wr(75, 8)), done(wr(77.5, 8)), done(wr(80, 8)), { ...wr(85, 8), done: false }, done(wr(80, 8))];
    expect(prsForSequence("weight_reps", history, sets)).toEqual([[], [], ["weight", "e1rm"], [], []]);
  });
});

describe("rest timer + MuscleWiki links", () => {
  it("rest snaps to 15 s steps between 15 s and 10 min", () => {
    expect(clampRest(97)).toBe(90);
    expect(clampRest(0)).toBe(15);
    expect(clampRest(9999)).toBe(600);
  });

  it("accepts only musclewiki.com links and tidies them", () => {
    expect(cleanMusclewikiUrl("https://musclewiki.com/exercise/barbell-bench-press")).toBe(
      "https://musclewiki.com/exercise/barbell-bench-press",
    );
    expect(cleanMusclewikiUrl("musclewiki.com/exercise/barbell-curl/?utm=x")).toBe("https://musclewiki.com/exercise/barbell-curl");
    expect(cleanMusclewikiUrl("https://www.musclewiki.com/en-us/exercise/plank")).toBe("https://musclewiki.com/en-us/exercise/plank");
    expect(cleanMusclewikiUrl("http://musclewiki.com/exercise/x")).toBeNull();
    expect(cleanMusclewikiUrl("https://evil.com/musclewiki.com")).toBeNull();
    expect(cleanMusclewikiUrl("https://musclewiki.com.evil.com/x")).toBeNull();
  });

  it("converts pounds", () => {
    expect(lbToKg(185)).toBe(83.9);
  });
});
