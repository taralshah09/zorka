// Life plan domain core · day facts and day types (docs/LIFE_PLAN.md "life.ts", "dayType.ts"; D72–D74).
import { describe, expect, it } from "vitest";

import { classifyDay, DAY_RULES, DAY_TYPES } from "../../shared/domain/dayType.js";
import {
  dayBounds,
  DEFAULT_SLEEP_MINUTE,
  DEFAULT_WAKE_MINUTE,
  EMPTY_STANDING,
  freeMinutes,
  freeWindows,
  LATE_MOVE_MINUTE,
  MAX_BLOCKS,
  trainingWindow,
  validateDayFacts,
} from "../../shared/domain/life.js";
import {
  at,
  EXPO_CLIENT_DINNER,
  EXPO_WED,
  facts,
  FLIGHT_THU,
  HOSTEL,
  HOSTEL_DAY,
  LATE_TUE,
  OFFICE,
  OFFICE_DAY,
  OTHER_CITY_FRI,
  WEDDING_SAT,
} from "./fixtures/lifeScenarios.js";

describe("validateDayFacts (LA2)", () => {
  it("never throws on garbage and gives an empty usual day", () => {
    for (const junk of [null, undefined, 42, "expo", [], { blocks: "x", flags: 3, mealAccess: [] }]) {
      expect(validateDayFacts(junk)).toEqual({ blocks: [], whereabouts: "home", mealAccess: {}, flags: [] });
    }
  });

  it("drops unknown values and keeps known ones", () => {
    const f = validateDayFacts({
      blocks: [
        { from: 600, to: 720, kind: "meeting", label: "  Standup  ", canEat: "yes", canMove: false },
        { from: "9", to: 700, kind: "work" },
        { from: NaN, to: 700, kind: "work" },
      ],
      whereabouts: "moon",
      mealAccess: { lunch: "mess", dinner: "pizza", brunch: "home" },
      flags: ["sick", "sick", "party", "exam"],
    });
    expect(f.blocks).toEqual([{ from: 600, to: 720, kind: "other", label: "Standup", canMove: false }]);
    expect(f.whereabouts).toBe("home");
    expect(f.mealAccess).toEqual({ lunch: "mess" });
    expect(f.flags).toEqual(["sick", "exam"]);
  });

  it("rounds and clamps times; a block written 22:00–01:00 runs past midnight", () => {
    const f = validateDayFacts({
      blocks: [
        { from: -30, to: 60.4, kind: "sleep" },
        { from: at(22), to: at(1), kind: "social" },
      ],
    });
    expect(f.blocks).toEqual([
      { from: 0, to: 60, kind: "sleep" },
      { from: at(22), to: at(25), kind: "social" },
    ]);
  });

  it("drops blocks that are too short and trims overlaps to start where the previous one ends", () => {
    const f = validateDayFacts({
      blocks: [
        { from: at(14), to: at(16), kind: "work" },
        { from: at(9), to: at(13), kind: "work" },
        { from: at(12), to: at(15), kind: "event" }, // trimmed to 13:00
        { from: at(13), to: at(15, 5), kind: "social" }, // ends 5 min after the previous: dropped
        { from: at(18), to: at(18, 5), kind: "other" }, // 5 min: dropped
      ],
    });
    expect(f.blocks.map((b) => [b.from, b.to, b.kind])).toEqual([
      [at(9), at(13), "work"],
      [at(13), at(15), "event"],
      [at(15), at(16), "work"],
    ]);
  });

  it(`keeps at most ${MAX_BLOCKS} blocks`, () => {
    const blocks = Array.from({ length: 20 }, (_, i) => ({ from: i * 60, to: i * 60 + 30, kind: "work" }));
    expect(validateDayFacts({ blocks }).blocks).toHaveLength(MAX_BLOCKS);
  });

  it("sleep before wake means after midnight; nonsense sleep is dropped", () => {
    expect(validateDayFacts({ wakeMinute: at(7), sleepMinute: at(1) }).sleepMinute).toBe(at(25));
    expect(validateDayFacts({ wakeMinute: at(7), sleepMinute: 5000 }).sleepMinute).toBeUndefined();
  });

  it("is idempotent", () => {
    for (const f of [EXPO_WED, LATE_TUE, WEDDING_SAT, FLIGHT_THU]) {
      const once = validateDayFacts(f);
      expect(validateDayFacts(once)).toEqual(once);
    }
  });
});

describe("free windows (LA3)", () => {
  it("expo day: nothing free 13:00–19:00", () => {
    const w = freeWindows(EXPO_WED, at(7), at(23));
    expect(w).toEqual([
      { from: at(7), to: at(9, 30) },
      { from: at(12, 30), to: at(13) },
      { from: at(19), to: at(23) },
    ]);
    expect(w.some((x) => x.from < at(19) && x.to > at(13))).toBe(false);
  });

  it("late meeting: the only free time after breakfast is lunch, 13:00–14:00", () => {
    const b = dayBounds(LATE_TUE);
    expect(b).toEqual({ from: DEFAULT_WAKE_MINUTE, to: at(23, 30) });
    expect(freeWindows(LATE_TUE, b.from, b.to)).toEqual([
      { from: at(7), to: at(9, 30) },
      { from: at(13), to: at(14) },
      { from: at(23), to: at(23, 30) },
    ]);
  });

  it("an empty day is one window; learned times fill in for a brief without them", () => {
    expect(freeWindows(facts({}), at(7), at(23))).toEqual([{ from: at(7), to: at(23) }]);
    expect(dayBounds(facts({}), { wakeMinute: at(6) })).toEqual({ from: at(6), to: DEFAULT_SLEEP_MINUTE });
    expect(freeMinutes(freeWindows(OFFICE_DAY, at(7), at(23)))).toBe(16 * 60 - 510);
  });

  it("a training window fits routine + 15 min and finishes by 21:30", () => {
    const w = freeWindows(EXPO_WED, at(7), at(23));
    expect(trainingWindow(w, 60)).toEqual({ from: at(7), to: at(9, 30) });
    // 20:30–23:00 only counts until 21:30: 60 min, enough for 45 + 15 and not for 46 + 15.
    const evening = [{ from: at(20, 30), to: at(23) }];
    expect(trainingWindow(evening, 45)).toEqual({ from: at(20, 30), to: LATE_MOVE_MINUTE });
    expect(trainingWindow(evening, 46)).toBeNull();
    expect(trainingWindow([{ from: at(22), to: at(23) }], 10)).toBeNull();
  });
});

describe("classifyDay (LA2)", () => {
  it("the scenario days", () => {
    expect(classifyDay(EXPO_WED, OFFICE)).toBe("away");
    expect(classifyDay(EXPO_CLIENT_DINNER, OFFICE)).toBe("away");
    expect(classifyDay(LATE_TUE, OFFICE)).toBe("late_work");
    expect(classifyDay(HOSTEL_DAY, HOSTEL)).toBe("normal");
    expect(classifyDay(WEDDING_SAT, OFFICE)).toBe("feast");
    expect(classifyDay(FLIGHT_THU, OFFICE)).toBe("travel");
    expect(classifyDay(OTHER_CITY_FRI, OFFICE)).toBe("away");
    expect(classifyDay(OFFICE_DAY, OFFICE)).toBe("normal");
  });

  it("first match wins", () => {
    const s = EMPTY_STANDING;
    expect(classifyDay({ ...FLIGHT_THU, flags: ["sick"] }, s)).toBe("sick");
    expect(classifyDay({ ...EXPO_WED, whereabouts: "travelling" }, s)).toBe("travel");
    expect(classifyDay({ ...EXPO_WED, flags: ["feast"] }, s)).toBe("feast");
    expect(classifyDay({ ...LATE_TUE, flags: ["exam"] }, s)).toBe("late_work");
    expect(classifyDay({ ...OFFICE_DAY, flags: ["exam", "rest_day"] }, s)).toBe("exam");
    expect(classifyDay({ ...OFFICE_DAY, flags: ["rest_day"] }, s)).toBe("rest");
  });

  it("thresholds: away at 5 h of event/travel, travel at 3 h of travel, late work after 21:00, busy under 3 h free", () => {
    const s = EMPTY_STANDING;
    expect(classifyDay(facts({ blocks: [{ from: at(12), to: at(17), kind: "event" }] }), s)).toBe("away");
    expect(classifyDay(facts({ blocks: [{ from: at(12), to: at(16, 59), kind: "event" }] }), s)).toBe("normal");
    expect(classifyDay(facts({ blocks: [{ from: at(8), to: at(11), kind: "travel" }] }), s)).toBe("travel");
    expect(classifyDay(facts({ blocks: [{ from: at(12), to: at(21), kind: "work" }] }), s)).toBe("normal");
    expect(classifyDay(facts({ blocks: [{ from: at(12), to: at(21, 1), kind: "work" }] }), s)).toBe("late_work");
    const long = facts({ blocks: [{ from: at(7), to: at(20, 1), kind: "study" }] });
    expect(classifyDay(long, s)).toBe("busy");
    expect(classifyDay({ ...long, blocks: [{ from: at(7), to: at(20), kind: "study" }] }, s)).toBe("normal");
  });

  it("a social meal is a feast only with event food", () => {
    const dinner = { from: at(20), to: at(22), kind: "social" as const, canEat: true };
    expect(classifyDay(facts({ blocks: [dinner], mealAccess: { dinner: "eat_out" } }), OFFICE)).toBe("normal");
    expect(classifyDay(facts({ blocks: [dinner], mealAccess: { dinner: "event_food" } }), OFFICE)).toBe("feast");
    expect(classifyDay(facts({ blocks: [dinner], mealAccess: { lunch: "event_food" } }), OFFICE)).toBe("normal");
  });

  it("every day type has rules; away and travel have no step nudge, sick raises water", () => {
    for (const t of DAY_TYPES) expect(DAY_RULES[t]).toBeDefined();
    expect(DAY_RULES.away).toMatchObject({ kcalRange: 200, stepNudge: false, water: "carry_bottle", workout: "move" });
    expect(DAY_RULES.travel).toMatchObject({ maintenance: true, stepNudge: false, workout: "move" });
    expect(DAY_RULES.sick).toMatchObject({ maintenance: true, water: "raised", workout: "none" });
    expect(DAY_RULES.late_work.latestWalkMinute).toBe(LATE_MOVE_MINUTE);
  });
});

describe("classifyDay · long sessions and busy blocks", () => {
  it("a study session until 23:00 is a late day; 6 h of other plans is busy; office hours stay usual", () => {
    expect(classifyDay(facts({ blocks: [{ from: at(14), to: at(23), kind: "study", label: "Session" }] }), EMPTY_STANDING)).toBe("late_work");
    expect(classifyDay(facts({ blocks: [{ from: at(14), to: at(20), kind: "other" }] }), EMPTY_STANDING)).toBe("busy");
    expect(classifyDay(facts({ blocks: [{ from: at(14), to: at(18, 59), kind: "other" }] }), EMPTY_STANDING)).toBe("normal");
    expect(classifyDay(OFFICE_DAY, OFFICE)).toBe("normal");
  });
});
