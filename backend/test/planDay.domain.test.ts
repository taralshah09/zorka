// LA3 · Plan the day (docs/LIFE_PLAN.md "planDay.ts", scenarios 1–3, LA3 exit criteria) and LA5's assumed usual day.
import { describe, expect, it } from "vitest";

import type { EatCandidate } from "../../shared/domain/eatOptions.js";
import { PROTEIN_STAPLES } from "../../shared/domain/eatOptions.js";
import { EMPTY_STANDING, LATE_MOVE_MINUTE, type DayFacts, type Standing } from "../../shared/domain/life.js";
import { activeFacts, NO_FACTS, type ActiveFacts, type MemoryFact } from "../../shared/domain/memory.js";
import { canEatIn, LUNCH_WALK_MINUTE, planDay, planInputsHash, type DayPlan, type PlanDayInput } from "../../shared/domain/planDay.js";
import {
  at,
  BASE,
  EXPO_ONLY_WED,
  facts,
  HOSTEL,
  HOSTEL_DAY,
  LATE_TUE,
  MON,
  OFFICE,
  onTarget,
  TUE,
  WED,
  WEDDING_SAT,
  SAT,
  week,
} from "./fixtures/lifeScenarios.js";

const cand = (id: string, name: string, over: Partial<EatCandidate> = {}): EatCandidate => ({
  id,
  name,
  source: "home",
  macros: { kcal: 300, proteinG: 20, carbsG: 30, fatG: 10 },
  diet: "veg",
  category: "home_meal",
  cuisine: null,
  mealTypes: [],
  timesLogged: 3,
  estimate: false,
  ...over,
});

const CANDIDATES = [
  cand("whey", "Whey shake", { costInrPerServing: 60, category: "protein", macros: { kcal: 130, proteinG: 25, carbsG: 4, fatG: 2 } }),
  cand("bhurji", "Paneer bhurji (home-made)", { needsKitchen: true }),
  cand("messdal", "Mess dal rice", { access: ["mess"], costInrPerServing: 0 }),
  cand("poha", "Poha", { macros: { kcal: 280, proteinG: 8, carbsG: 45, fatG: 8 } }),
];

function input(date: string, f: DayFacts | null, over: Partial<PlanDayInput> = {}): PlanDayInput {
  return {
    date,
    today: TUE,
    now: 0,
    base: { kcal: BASE.kcal, proteinG: BASE.proteinG, steps: BASE.steps, floorKcal: 1500, waterGlasses: 8, goal: "maintain" },
    standing: OFFICE,
    facts: f,
    patterns: NO_FACTS,
    ledger: week({ [MON]: { actual: onTarget(2000, 130, 8000, true) } }),
    routines: [{ id: "push", name: "Push day", minutes: 50 }],
    candidates: CANDIDATES,
    diet: "veg",
    staples: PROTEIN_STAPLES,
    sessionsTarget: 3,
    ...over,
  };
}

const DURATION: Record<string, number> = { meal: 20, workout: 50, walk: 20 };
/** LA3 exit: no item inside a block (a meal may sit in a block that has food) and nothing after 21:30. */
function expectFeasible(plan: DayPlan, f: DayFacts) {
  for (const item of plan.items) {
    if (item.kind === "prep" && item.dayOffset === -1) continue;
    expect(item.at, `${item.kind} at ${item.at}`).toBeLessThanOrEqual(LATE_MOVE_MINUTE);
    const len = item.kind === "walk" ? item.minutes : item.kind === "workout" ? item.minutes : DURATION[item.kind] ?? 0;
    for (const b of f.blocks) {
      if (item.kind === "meal" && canEatIn(b)) continue;
      const overlaps = len ? item.at < b.to && item.at + len > b.from : item.at >= b.from && item.at < b.to;
      expect(overlaps, `${item.kind} at ${item.at} inside ${b.label ?? b.kind}`).toBe(false);
    }
  }
}

describe("planDay · scenario 1 (expo Wed 13:00–19:00, briefed Tue)", () => {
  const pattern: ActiveFacts = { ...NO_FACTS, trainDays: [1, 3, 5] };
  const plan = planDay(input(WED, EXPO_ONLY_WED, { patterns: pattern }));

  it("away day, calories as a range of 1,800–2,200, the step goal stays", () => {
    expect(plan.dayType).toBe("away");
    expect(plan.targets).toMatchObject({ kcal: 2000, kcalRange: [1800, 2200], steps: 8000 });
    expect(plan.assumed).toBe(false);
  });

  it("nothing scheduled 13:00–19:00 and nothing after 21:30", () => expectFeasible(plan, EXPO_ONLY_WED));

  it("pack chana and a bottle: the night before at 21:30 and at 12:15 before leaving", () => {
    const prep = plan.items.filter((i) => i.kind === "prep");
    expect(prep.map((p) => [p.dayOffset, p.at])).toEqual([[-1, at(21, 30)], [0, at(12, 15)]]);
    expect(prep[0]!.kind === "prep" && prep[0]!.text).toMatch(/chana.*1 L bottle/);
  });

  it("no workout on the expo day; the week moves the session to Thursday", () => {
    expect(plan.items.some((i) => i.kind === "workout")).toBe(false);
    expect(plan.week.days.find((d) => d.date === "2026-10-22")).toMatchObject({ train: true });
  });

  it("breakfast at home front-loads protein; lunch is packed", () => {
    const meals = plan.items.filter((i) => i.kind === "meal");
    expect(meals.find((m) => m.kind === "meal" && m.slot === "breakfast")).toMatchObject({ access: "home" });
    expect(meals.find((m) => m.kind === "meal" && m.slot === "lunch")).toMatchObject({ access: "packed" });
  });

  it("a refill reminder as the expo ends, not during it", () => {
    expect(plan.items.filter((i) => i.kind === "water").map((w) => w.at)).toEqual([at(19)]);
  });
});

describe("planDay · scenario 2 (late meeting Tue until 23:00)", () => {
  const plan = planDay(input(TUE, LATE_TUE));

  it("late_work, a 20-minute walk at 13:15 instead of the evening, nothing after 21:30", () => {
    expect(plan.dayType).toBe("late_work");
    const walk = plan.items.find((i) => i.kind === "walk");
    expect(walk).toMatchObject({ at: LUNCH_WALK_MINUTE, minutes: 20 });
    expect(plan.why).toContain("lunch_walk");
    expectFeasible(plan, LATE_TUE);
  });
});

describe("planDay · scenario 3 (hostel, tight, veg, mess for every meal)", () => {
  const plan = planDay(
    input(TUE, HOSTEL_DAY, {
      standing: HOSTEL,
      base: { kcal: 2200, proteinG: 110, steps: 8000, floorKcal: 1500, waterGlasses: 8, goal: "maintain" },
      ledger: week({}, { base: { kcal: 2200, proteinG: 110, steps: 8000 } }),
    }),
  );

  it("starts at the realistic 75 g, may take ≤ 20% more for the week, with a soya step-up at about ₹10", () => {
    expect(plan.targets.proteinG).toBeGreaterThanOrEqual(75);
    expect(plan.targets.proteinG).toBeLessThanOrEqual(75 + 15);
    expect(plan.protein).toMatchObject({ achievableG: 75, stepUp: { costInr: 10, staple: { id: "soya_30" } } });
  });

  it("never offers whey or a kitchen-only item", () => {
    const ids = plan.items.flatMap((i) => (i.kind === "meal" ? i.options.map((o) => o.id) : []));
    expect(ids).not.toContain("whey");
    expect(ids).not.toContain("bhurji");
    expect(ids).toContain("messdal");
  });
});

describe("planDay · other days", () => {
  it("a wedding Saturday is a feast with its allowance; dinner sits at the wedding", () => {
    const plan = planDay(input(SAT, WEDDING_SAT, { allowanceKcal: 2500 }));
    expect(plan.dayType).toBe("feast");
    expect(plan.targets.kcal).toBe(2500);
    expect(plan.why).toContain("event_food");
    expect(plan.items.find((i) => i.kind === "meal" && i.slot === "dinner")).toMatchObject({ options: [] });
  });

  it("sick: maintenance, more water, no workout or walk", () => {
    const sick = facts({ flags: ["sick"] });
    const plan = planDay(input(WED, sick, { base: { kcal: 1800, proteinG: 120, steps: 8000, floorKcal: 1400, waterGlasses: 8, goal: "lose_fat", maintenanceKcal: 2300 } }));
    expect(plan.dayType).toBe("sick");
    expect(plan.targets).toMatchObject({ kcal: 2300, steps: null, waterGlasses: 10 });
    expect(plan.items.some((i) => i.kind === "workout" || i.kind === "walk")).toBe(false);
    expect(plan.items.filter((i) => i.kind === "water").length).toBeGreaterThan(0);
  });

  it("a usual day with time to train gets a workout by 21:30", () => {
    const plan = planDay(input(TUE, facts({ blocks: [{ from: at(9, 30), to: at(18), kind: "work" }] }), { ledger: week() }));
    const w = plan.items.find((i) => i.kind === "workout");
    expect(w).toMatchObject({ routineId: "push", minutes: 50 });
    expect(w!.at + 50).toBeLessThanOrEqual(LATE_MOVE_MINUTE);
  });

  it("items before `now` are left out when planning today", () => {
    const plan = planDay(input(TUE, facts({}), { now: at(15) }));
    expect(plan.items.every((i) => (i.kind === "prep" && i.dayOffset === -1) || i.at >= at(15))).toBe(true);
  });
});

describe("assumed usual day (D79, LA5 exit)", () => {
  const learned: MemoryFact[] = [
    { id: "1", key: "usual_meal:lunch:weekday", kind: "pattern", value: { slot: "lunch", dayKind: "weekday", mealKey: "dal|roti", text: "dal + 3 roti", at: at(13, 30) }, text: "Lunch on weekdays is usually dal + 3 roti around 1:30pm", source: "inferred", confidence: 0.9, evidence: { count: 6, window: 28, lastSeen: MON }, status: "active", validFrom: null, validUntil: null },
    { id: "2", key: "usual_meal:breakfast:weekday", kind: "pattern", value: { slot: "breakfast", dayKind: "weekday", mealKey: "poha", text: "poha + chai", at: at(8) }, text: "Breakfast on weekdays is usually poha + chai around 8am", source: "inferred", confidence: 0.9, evidence: { count: 7, window: 28, lastSeen: MON }, status: "active", validFrom: null, validUntil: null },
    { id: "3", key: "usual_meal:dinner:weekday", kind: "pattern", value: { slot: "dinner", dayKind: "weekday", mealKey: "x", text: "should not show" }, text: "x", source: "inferred", confidence: 0.5, evidence: null, status: "suggested", validFrom: null, validUntil: null },
  ];
  const plan = planDay(input(TUE, null, { patterns: activeFacts(learned, TUE) }));

  it("says it assumed, and uses the office hours", () => {
    expect(plan.assumed).toBe(true);
    expect(plan.why[0]).toBe("assumed_day");
    expect(plan.dayType).toBe("normal");
  });

  it("the assumed Tuesday's meals are the user's actual Tuesday meals, at their times", () => {
    const meals = plan.items.filter((i) => i.kind === "meal");
    expect(meals.find((m) => m.kind === "meal" && m.slot === "lunch")).toMatchObject({ title: "dal + 3 roti", at: at(13, 30), usual: true });
    expect(meals.find((m) => m.kind === "meal" && m.slot === "breakfast")).toMatchObject({ title: "poha + chai", at: at(8), usual: true });
    expect(meals.find((m) => m.kind === "meal" && m.slot === "dinner")).toMatchObject({ title: "Dinner", usual: false });
  });

  it("with nothing known, an assumed day still plans (no blocks without a work pattern)", () => {
    const bare = planDay(input(TUE, null, { standing: EMPTY_STANDING as Standing }));
    expect(bare.assumed).toBe(true);
    expect(bare.items.filter((i) => i.kind === "meal")).toHaveLength(4);
  });
});

describe("planInputsHash", () => {
  it("stable across key order and the clock; changes with the brief", () => {
    const a = input(WED, EXPO_ONLY_WED);
    const reordered = Object.fromEntries(Object.entries(a).reverse()) as PlanDayInput;
    expect(planInputsHash(reordered)).toBe(planInputsHash(a));
    expect(planInputsHash({ ...a, now: 900 })).toBe(planInputsHash(a));
    expect(planInputsHash({ ...a, facts: LATE_TUE })).not.toBe(planInputsHash(a));
    expect(planInputsHash(a)).toMatch(/^[0-9a-f]{8}$/);
  });
});
