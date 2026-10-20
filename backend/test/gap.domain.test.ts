// P31–P33, P36 · Gap, Eat ranking, Move options and the nudge rules (D55–D57, D61).
import { describe, expect, it } from "vitest";

import {
  bestPortion,
  dietForSwitch,
  excluded,
  isJunk,
  rankEatOptions,
  switchSideFor,
  type EatCandidate,
  type RankContext,
} from "../../shared/domain/eatOptions.js";
import { computeGap, expectedShare } from "../../shared/domain/gap.js";
import { easePlan, minutesFor, moveOptions, type MoveInput } from "../../shared/domain/moveOptions.js";
import { DEFAULT_NUDGE_SETTINGS, inQuietHours, planNudges, type NudgeFacts } from "../../shared/domain/nudges.js";

const T = { kcal: 2050, proteinG: 130, carbsG: 230, fatG: 60 };
const at = (h: number, m = 0) => h * 60 + m;

describe("gap (P31, D55)", () => {
  it("expected share follows the meal checkpoints", () => {
    expect(expectedShare(at(6))).toBe(0);
    expect(expectedShare(at(10, 30))).toBeCloseTo(0.25);
    expect(expectedShare(at(15))).toBeCloseTo(0.6);
    expect(expectedShare(at(18))).toBeCloseTo(0.7);
    expect(expectedShare(at(23))).toBe(1);
    expect(expectedShare(at(12, 45))).toBeCloseTo(0.25 + (0.35 * 135) / 270);
  });

  it("targets − eaten + burned", () => {
    const g = computeGap({ targets: T, eaten: { kcal: 810, proteinG: 68, carbsG: 100, fatG: 30 }, burnedKcal: 200, minuteOfDay: at(13) });
    expect(g.budget.kcal).toBe(2250);
    expect(g.remaining).toEqual({ kcal: 1440, proteinG: 62, carbsG: 130, fatG: 30 });
  });

  it("1 PM with 810 kcal eaten is on track", () => {
    const g = computeGap({ targets: T, eaten: { kcal: 810, proteinG: 55, carbsG: 100, fatG: 30 }, burnedKcal: 0, minuteOfDay: at(13) });
    expect(g.state).toBe("on_track");
  });

  it("8:30 PM with 480 kcal and 45 g protein left is under, focus protein", () => {
    const g = computeGap({ targets: T, eaten: { kcal: 1570, proteinG: 85, carbsG: 200, fatG: 50 }, burnedKcal: 0, minuteOfDay: at(20, 30) });
    expect(g.state).toBe("under");
    expect(g.remaining.kcal).toBe(480);
    expect(g.focus).toBe("protein");
  });

  it("over only when more than 100 kcal past the budget", () => {
    const eaten = (kcal: number) => ({ kcal, proteinG: 80, carbsG: 0, fatG: 0 });
    expect(computeGap({ targets: T, eaten: eaten(2140), burnedKcal: 0, minuteOfDay: at(14) }).state).not.toBe("over");
    expect(computeGap({ targets: T, eaten: eaten(2700), burnedKcal: 0, minuteOfDay: at(14) }).state).toBe("over");
    // Burned kcal raise the budget.
    expect(computeGap({ targets: T, eaten: eaten(2200), burnedKcal: 200, minuteOfDay: at(14) }).state).not.toBe("over");
  });

  it("done when kcal is within 100 and protein ≥ 95%", () => {
    const g = computeGap({ targets: T, eaten: { kcal: 2000, proteinG: 125, carbsG: 0, fatG: 0 }, burnedKcal: 0, minuteOfDay: at(21) });
    expect(g.state).toBe("done");
  });

  it("before 7 AM nothing is expected yet", () => {
    expect(computeGap({ targets: T, eaten: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }, burnedKcal: 0, minuteOfDay: at(6) }).state).toBe("on_track");
  });
});

const cand = (over: Partial<EatCandidate> & Pick<EatCandidate, "name" | "source">): EatCandidate => ({
  id: over.name,
  macros: { kcal: 400, proteinG: 30, carbsG: 30, fatG: 15 },
  diet: "veg",
  category: "home_meal",
  cuisine: "indian",
  mealTypes: [],
  timesLogged: 0,
  estimate: false,
  ...over,
});

const ctx: RankContext = {
  remaining: { kcal: 480, proteinG: 45, carbsG: 50, fatG: 15 },
  budgetKcal: 2050,
  focus: "protein",
  diet: "veg",
  mealType: "dinner",
  cuisineShare: { indian: 0.8, italian: 0.2 },
};

describe("eat options (P32, D56)", () => {
  it("junk filter: sweets, sugary drinks, fried snacks, pure fats, junk names", () => {
    const m = (kcal: number, proteinG: number, carbsG: number, fatG: number) => ({ kcal, proteinG, carbsG, fatG });
    expect(isJunk({ name: "Gulab jamun", category: "sweet", macros: m(300, 4, 50, 10) })).toBe(true);
    expect(isJunk({ name: "Cola", category: "drink", macros: m(105, 0, 26, 0) })).toBe(true);
    expect(isJunk({ name: "Samosa", category: "snack", macros: m(217, 3.5, 22, 12.6) })).toBe(true);
    expect(isJunk({ name: "Ghee", category: "dairy", macros: m(90, 0, 0, 10) })).toBe(true);
    expect(isJunk({ name: "Paneer pizza", category: null, macros: m(600, 25, 70, 25) })).toBe(true);
    expect(isJunk({ name: "Chocolate protein shake", category: "drink", macros: m(200, 25, 15, 4) })).toBe(false);
    expect(isJunk({ name: "Paneer bhurji", category: "home_meal", macros: m(300, 18, 8, 22) })).toBe(false);
    expect(isJunk({ name: "Roasted makhana", category: "snack", macros: m(95, 2.4, 16, 2.3) })).toBe(false);
  });

  it("diet is a hard filter; unknown diet only for non-veg", () => {
    expect(excluded(cand({ name: "Chicken bowl", source: "zomato", diet: "non_veg" }), ctx)).toBe("diet");
    expect(excluded(cand({ name: "Mystery bowl", source: "zomato", diet: null }), ctx)).toBe("diet");
    expect(excluded(cand({ name: "Mystery bowl", source: "zomato", diet: null }), { ...ctx, diet: "non_veg" })).toBeNull();
    expect(excluded(cand({ name: "Jain dal", source: "home", diet: "jain" }), ctx)).toBeNull();
  });

  it("never more than 10% over the kcal left, nothing while over", () => {
    expect(excluded(cand({ name: "Big thali", source: "usual", macros: { kcal: 540, proteinG: 30, carbsG: 0, fatG: 0 } }), ctx)).toBe("too_big");
    expect(excluded(cand({ name: "Thali", source: "usual", macros: { kcal: 520, proteinG: 30, carbsG: 0, fatG: 0 } }), ctx)).toBeNull();
    expect(rankEatOptions([cand({ name: "Dal", source: "home" })], { ...ctx, remaining: { ...ctx.remaining, kcal: -50 } })).toEqual([]);
  });

  it("ranks protein fit first and mixes sources (≤ 2 per group, 3–5 total)", () => {
    const options = rankEatOptions(
      [
        cand({ name: "Paneer tikka", source: "usual", macros: { kcal: 380, proteinG: 32, carbsG: 10, fatG: 22 }, mealTypes: ["dinner"], timesLogged: 6 }),
        cand({ name: "Dal rice", source: "usual", macros: { kcal: 450, proteinG: 14, carbsG: 70, fatG: 10 }, mealTypes: ["lunch"], timesLogged: 9 }),
        cand({ name: "Poha", source: "usual", macros: { kcal: 300, proteinG: 6, carbsG: 50, fatG: 8 }, mealTypes: ["breakfast"], timesLogged: 12 }),
        cand({ name: "Soya chunks curry", source: "home", macros: { kcal: 280, proteinG: 26, carbsG: 15, fatG: 12 } }),
        cand({ name: "Greek yogurt", source: "home", category: "dairy", macros: { kcal: 150, proteinG: 15, carbsG: 6, fatG: 6 } }),
        cand({ name: "Moong dal", source: "home", macros: { kcal: 160, proteinG: 10, carbsG: 22, fatG: 3 } }),
        cand({ name: "Tandoori soya chaap bowl", source: "zomato", macros: { kcal: 420, proteinG: 28, carbsG: 30, fatG: 18 }, estimate: true }),
        cand({ name: "Rasmalai", source: "blinkit", category: "sweet" }),
      ],
      ctx,
    );
    expect(options.length).toBeGreaterThanOrEqual(3);
    expect(options.length).toBeLessThanOrEqual(5);
    expect(options[0]!.name).toBe("Paneer tikka");
    expect(options.filter((o) => o.source === "usual").length).toBeLessThanOrEqual(2);
    expect(options.filter((o) => o.source === "home").length).toBeLessThanOrEqual(2);
    expect(options.some((o) => o.name === "Rasmalai")).toBe(false);
    expect(options.some((o) => o.source === "zomato")).toBe(true);
  });

  it("fills up to 3 from the leftovers when one group dominates", () => {
    const options = rankEatOptions(
      ["Dal", "Paneer", "Tofu", "Curd"].map((name, i) => cand({ name, source: "home", macros: { kcal: 200 + i * 10, proteinG: 15, carbsG: 0, fatG: 0 } })),
      ctx,
    );
    expect(options).toHaveLength(3);
  });

  it("drops duplicates by name", () => {
    const options = rankEatOptions([cand({ name: "Dal", source: "usual" }), cand({ name: "dal ", source: "home" })], ctx);
    expect(options).toHaveLength(1);
  });

  it("veg/non-veg switch keeps the profile's nuance", () => {
    expect(dietForSwitch("jain", "veg")).toBe("jain");
    expect(dietForSwitch("eggetarian", "veg")).toBe("veg");
    expect(dietForSwitch("eggetarian", "non_veg")).toBe("eggetarian");
    expect(dietForSwitch("veg", "non_veg")).toBe("non_veg");
    expect(switchSideFor("jain")).toBe("veg");
    expect(switchSideFor("eggetarian")).toBe("non_veg");
  });

  it("best portion fits the gap without going too big", () => {
    const p = (q: number) => ({ q, macros: { kcal: 150 * q, proteinG: 12 * q, carbsG: 0, fatG: 0 } });
    expect(bestPortion([p(1), p(2), p(3), p(4)], ctx)!.q).toBe(3);
    expect(bestPortion([p(4)], ctx)).toBeNull();
  });
});

const MET = { walk: 3.8, ride: 6.8, run: 8.3 };
const move = (over: Partial<MoveInput>): MoveInput => ({
  remainingKcal: -650,
  weightKg: 70,
  minuteOfDay: at(15),
  met: MET,
  tomorrowKcal: 2050,
  floorKcal: 1500,
  steps: null,
  stepGoal: 8000,
  overToleranceKcal: 100,
  ...over,
});

describe("move options (P33, D57)", () => {
  it("minutes from MET × weight, rounded to 5, capped", () => {
    // walk at 70 kg: 4.43 kcal/min → 250 kcal ≈ 56 → 55 min
    expect(minutesFor(250, 3.8, 70, 60)).toEqual({ minutes: 55, closes: true });
    expect(minutesFor(650, 3.8, 70, 60)).toEqual({ minutes: 60, closes: false });
    expect(minutesFor(20, 3.8, 70, 60)).toEqual({ minutes: 10, closes: true });
  });

  it("over in the afternoon: walk, ride, run (run ≤ 45 min) and spread it", () => {
    const opts = moveOptions(move({}));
    const walk = opts.find((o) => o.kind === "activity" && o.activity === "walk");
    const run = opts.find((o) => o.kind === "activity" && o.activity === "run");
    expect(walk).toMatchObject({ minutes: 60, closes: false });
    expect(run).toMatchObject({ minutes: 45 });
    expect(opts.find((o) => o.kind === "spread")).toMatchObject({ minutes: 30, easePerDay: 150, days: 2 });
  });

  it("small overage: a walk closes it, no spread", () => {
    const opts = moveOptions(move({ remainingKcal: -250 }));
    expect(opts[0]).toMatchObject({ kind: "activity", activity: "walk", minutes: 55, closes: true });
    expect(opts.some((o) => o.kind === "spread")).toBe(false);
  });

  it("late at night: no run, tomorrow eases instead", () => {
    const opts = moveOptions(move({ minuteOfDay: at(22, 15) }));
    expect(opts).toEqual([{ kind: "ease", easePerDay: 150, days: 2 }]);
    expect(moveOptions(move({ minuteOfDay: at(23), remainingKcal: -150 }))).toEqual([{ kind: "ease", easePerDay: 150, days: 1 }]);
  });

  it("easing never goes below the floor", () => {
    expect(easePlan(300, 1600, 1500)).toEqual({ kind: "ease", easePerDay: 100, days: 2 });
    expect(easePlan(300, 1500, 1500)).toBeNull();
  });

  it("low activity at 6 PM: a brisk walk for the step gap", () => {
    const opts = moveOptions(move({ remainingKcal: 300, minuteOfDay: at(18), steps: 4200 }));
    expect(opts[0]).toMatchObject({ kind: "steps", minutes: 40, points: 40 });
  });

  it("not over, not low: walk and ride for 30 minutes; nothing after 21:30", () => {
    expect(moveOptions(move({ remainingKcal: 300 })).map((o) => o.kind)).toEqual(["activity", "activity"]);
    expect(moveOptions(move({ remainingKcal: 300, minuteOfDay: at(22) }))).toEqual([]);
  });
});

const facts = (over: Partial<NudgeFacts> = {}): NudgeFacts => ({
  minuteOfDay: at(7, 30),
  proteinLeftShare: 1,
  underAtSlipping: true,
  hasRoutine: true,
  workoutToday: false,
  streakCurrent: 5,
  loggedToday: false,
  allGoalsHit: false,
  deliveredToday: 0,
  praiseSentToday: false,
  coverageComplete: true,
  ...over,
});

// PA: nudges are opt-in, so the rules are tested with them switched on (4 a day, every kind).
const ON = {
  ...DEFAULT_NUDGE_SETTINGS,
  enabled: true,
  perDay: 4,
  kinds: { morning: true, protein: true, workout: true, slipping: true, streak: true, praise: true },
};

describe("nudges (P36, D61; PA defaults and gating)", () => {
  it("quiet hours wrap past midnight", () => {
    const s = DEFAULT_NUDGE_SETTINGS;
    expect(inQuietHours(at(23), s)).toBe(true);
    expect(inQuietHours(at(6, 59), s)).toBe(true);
    expect(inQuietHours(at(7), s)).toBe(false);
    expect(inQuietHours(at(21, 59), s)).toBe(false);
  });

  it("caps today at 4 by priority (morning > workout > protein > slipping > praise > streak)", () => {
    const today = planNudges(facts(), ON).filter((n) => n.dayOffset === 0);
    expect(today.map((n) => n.kind)).toEqual(["morning", "protein", "workout", "slipping"]);
    expect(today.find((n) => n.kind === "protein")!.route).toBe("gap");
    expect(today.find((n) => n.kind === "workout")!.route).toBe("train");
  });

  it("only future nudges whose condition holds", () => {
    const today = planNudges(
      facts({ minuteOfDay: at(17), proteinLeftShare: 0.1, loggedToday: true, workoutToday: true }),
      ON,
    ).filter((n) => n.dayOffset === 0);
    expect(today.map((n) => n.kind)).toEqual(["slipping"]);
  });

  it("delivered nudges count against the cap; praise is immediate and once a day", () => {
    const s = ON;
    const hit = facts({ minuteOfDay: at(19), allGoalsHit: true, loggedToday: true, proteinLeftShare: 0, deliveredToday: 3 });
    const today = planNudges(hit, s).filter((n) => n.dayOffset === 0);
    expect(today).toEqual([{ kind: "praise", route: "today", dayOffset: 0, minute: at(19), immediate: true }]);
    expect(planNudges({ ...hit, praiseSentToday: true }, s).filter((n) => n.dayOffset === 0)).toEqual([]);
  });

  it("tomorrow's morning plan and streak check; settings turn kinds off", () => {
    const s = { ...ON, kinds: { ...ON.kinds, streak: false } };
    const tomorrow = planNudges(facts({ minuteOfDay: at(21) }), s).filter((n) => n.dayOffset === 1);
    expect(tomorrow.map((n) => n.kind)).toEqual(["morning"]);
    expect(planNudges(facts(), { ...ON, enabled: false })).toEqual([]);
  });

  it("PA: off by default, 1 a day when switched on", () => {
    expect(DEFAULT_NUDGE_SETTINGS.enabled).toBe(false);
    expect(Object.values(DEFAULT_NUDGE_SETTINGS.kinds).every((k) => k === false)).toBe(true);
    expect(planNudges(facts(), DEFAULT_NUDGE_SETTINGS)).toEqual([]);
    const one = planNudges(facts(), { ...ON, perDay: DEFAULT_NUDGE_SETTINGS.perDay }).filter((n) => n.dayOffset === 0);
    expect(one.map((n) => n.kind)).toEqual(["morning"]);
  });

  it("PA: protein, slipping and praise need records confirmed complete; a finished visit stops them", () => {
    const kinds = (over: Partial<NudgeFacts>) => planNudges(facts(over), ON).filter((n) => n.dayOffset === 0).map((n) => n.kind);
    expect(kinds({ coverageComplete: false })).toEqual(["morning", "workout", "streak"]);
    expect(kinds({ visitFinished: true })).toEqual(["morning", "workout", "streak"]);
    const hit = { minuteOfDay: at(19), allGoalsHit: true, loggedToday: true, proteinLeftShare: 0 };
    expect(kinds({ ...hit, coverageComplete: false })).toEqual([]);
  });

  it("PA: custom times; no workout nudge on a rest day or at 21:30 and later", () => {
    const times = (t: Partial<Record<"morning" | "workout", number>>, over: Partial<NudgeFacts> = {}) =>
      planNudges(facts({ coverageComplete: false, streakCurrent: 0, ...over }), { ...ON, times: t }).filter((n) => n.dayOffset === 0);
    expect(times({ workout: at(12) }).find((n) => n.kind === "workout")?.minute).toBe(at(12));
    expect(times({ workout: at(21, 30) }).map((n) => n.kind)).not.toContain("workout");
    expect(times({}, { restToday: true }).map((n) => n.kind)).not.toContain("workout");
    expect(times({ morning: at(9) }).find((n) => n.kind === "morning")?.minute).toBe(at(9));
  });

  it("nothing lands in quiet hours", () => {
    const s = { ...ON, quietStart: at(19), quietEnd: at(9) };
    const kinds = planNudges(facts(), s).map((n) => n.kind);
    expect(kinds).not.toContain("slipping");
    expect(kinds).not.toContain("streak");
    expect(kinds).not.toContain("morning");
  });
});
