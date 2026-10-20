// Life plan domain core · the weekly ledger (docs/LIFE_PLAN.md "week.ts", D75–D77), with the scenario fixtures and
// seeded property tests (never below the floor, per-day caps, protein ≥ the day's base, Σ planned + forgiven = budget,
// unlogged days neutral).
import { describe, expect, it } from "vitest";

import { classifyDay, DAY_RULES, DAY_TYPES, type DayType } from "../../shared/domain/dayType.js";
import { achievableProteinG, PROTEIN_STAPLES, proteinStepUp } from "../../shared/domain/eatOptions.js";
import { dayBounds, freeWindows, trainingWindow } from "../../shared/domain/life.js";
import {
  chosenLimits,
  dayOptions,
  DEFAULT_SESSIONS_PER_WEEK,
  defaultCapacity,
  freshLedger,
  eventAllowance,
  LEDGER_RULES,
  MAX_TRAINING_STREAK,
  planWeek,
  sessionsTargetFor,
  sickMinProtein,
  spread,
  WEEK_KCAL_MAX_SHIFT,
  WEEK_KCAL_MAX_SHIFT_UP_LOSE_FAT,
  WEEK_PROTEIN_MAX_ADD_SHARE,
  WEEK_STEPS_MAX_ADD,
  weekDates,
  type DayLedgerInput,
  type WeekPlan,
} from "../../shared/domain/week.js";
import {
  BASE,
  EXPO_WED,
  FLIGHT_THU,
  FRI,
  HOSTEL,
  HOSTEL_DAY,
  LATE_TUE,
  MON,
  OFFICE,
  onTarget,
  OTHER_CITY_FRI,
  SAT,
  SUN,
  THU,
  TUE,
  WED,
  week,
  WEEK,
  WEDDING_SAT,
} from "./fixtures/lifeScenarios.js";

const day = (p: WeekPlan, date: string) => p.days.find((d) => d.date === date)!;
const FLOOR = 1500;

describe("helpers", () => {
  it("the week is Mon–Sun (D75)", () => {
    expect(weekDates(WED)).toEqual(WEEK);
    expect(weekDates(MON)).toEqual(WEEK);
    expect(weekDates(SUN)).toEqual(WEEK);
    expect(weekDates("2026-10-26")[0]).toBe("2026-10-26");
  });

  it("event allowance: base + 500 by default, never over base + 800 or under base", () => {
    expect(eventAllowance(1800)).toBe(2300);
    expect(eventAllowance(1800, 3000)).toBe(2600);
    expect(eventAllowance(1800, 1500)).toBe(1800);
    expect(eventAllowance(1800, null)).toBe(2300);
  });

  it("sessions target: profile, else learned, else 3", () => {
    expect(sessionsTargetFor(4, 2)).toBe(4);
    expect(sessionsTargetFor(null, 2)).toBe(2);
    expect(sessionsTargetFor(null)).toBe(DEFAULT_SESSIONS_PER_WEEK);
    expect(sessionsTargetFor(12)).toBe(7);
  });

  it("spread: by weight, never past a cap, whole numbers, Σ = min(amount, Σ cap)", () => {
    expect(spread(500, Array.from({ length: 6 }, () => ({ cap: 200, weight: 200 })))).toEqual([84, 84, 83, 83, 83, 83]);
    expect(spread(300, [{ cap: 50, weight: 1 }, { cap: 500, weight: 1 }])).toEqual([50, 250]);
    expect(spread(1000, [{ cap: 100, weight: 1 }, { cap: 200, weight: 3 }])).toEqual([100, 200]);
    expect(spread(90, [{ cap: 200, weight: 1 }, { cap: 200, weight: 2 }])).toEqual([30, 60]);
    expect(spread(100, [{ cap: 0, weight: 5 }, { cap: 100, weight: 0 }])).toEqual([0, 0]);
    expect(spread(-50, [{ cap: 100, weight: 1 }])).toEqual([0]);
  });
});

describe("scenarios (LIFE_PLAN.md)", () => {
  it("1 · expo Wed: away, 1,800–2,200 kcal, no step nudge, nothing 13:00–19:00, the gym session moves to Thu", () => {
    expect(classifyDay(EXPO_WED, OFFICE)).toBe("away");
    const pattern = new Set([MON, WED, FRI]);
    const p = planWeek(
      week({ [MON]: { actual: onTarget(2000, 130, 9000, true) }, [WED]: { dayType: "away" } }, {}).map((d) => ({
        ...d,
        patternDay: pattern.has(d.date),
      })),
      TUE,
      FLOOR,
      3,
    );
    const wed = day(p, WED);
    expect(wed.kcal).toBe(2000);
    expect([wed.kcal - DAY_RULES.away.kcalRange, wed.kcal + DAY_RULES.away.kcalRange]).toEqual([1800, 2200]);
    expect(wed.steps).toBe(8000); // expected "free" steps, the goal stays
    expect(DAY_RULES.away.stepNudge).toBe(false);
    expect(wed.why).toContain("away_no_steps");
    expect(wed.train).toBe(false);
    expect(day(p, THU)).toMatchObject({ train: true });
    expect(day(p, THU).why).toContain("session_moved");
    expect(day(p, FRI)).toMatchObject({ train: true });
    expect(day(p, FRI).why).toContain("session_planned");
    expect(p.days.filter((d) => d.train).map((d) => d.date)).toEqual([MON, THU, FRI]);
    expect(p.forgiven).toEqual({ kcal: 0, proteinG: 0, steps: 0, sessions: 0 });
    const free = freeWindows(EXPO_WED, 7 * 60, 23 * 60);
    expect(free.some((w) => w.from < 19 * 60 && w.to > 13 * 60)).toBe(false);
  });

  it("2 · late meeting Tue: late_work, a lunch walk fits, nothing that moves after 21:30", () => {
    expect(classifyDay(LATE_TUE, OFFICE)).toBe("late_work");
    const b = dayBounds(LATE_TUE);
    const free = freeWindows(LATE_TUE, b.from, b.to);
    expect(free).toContainEqual({ from: 13 * 60, to: 14 * 60 });
    expect(trainingWindow(free.filter((w) => w.from >= 12 * 60), 20)).toEqual({ from: 13 * 60, to: 14 * 60 });
    expect(DAY_RULES.late_work).toMatchObject({ nudges: "none_after_work", latestWalkMinute: 21 * 60 + 30 });
    expect(LEDGER_RULES.late_work.absorbs).toBe(true);
  });

  it("3 · hostel, tight, veg, mess: achievable 75 of 110, + soya at dinner ≈ ₹10, the ledger adds ≤ 20% over 75", () => {
    const input = { standing: HOSTEL, facts: HOSTEL_DAY, staples: PROTEIN_STAPLES, diet: "veg" as const };
    const achievable = achievableProteinG(input);
    expect(achievable).toBe(75);
    const step = proteinStepUp({ ...input, gapG: 110 - achievable });
    expect(step).toMatchObject({ costInr: 10, staple: { id: "soya_30", slot: "dinner" } });

    const base = { kcal: 2200, proteinG: 110, steps: 8000 };
    const p = planWeek(
      week({ [MON]: { actual: onTarget(2200, 50, 8000) } }, { base, achievableProteinG: achievable }),
      TUE,
      FLOOR,
      3,
    );
    // Short: Monday (110 − 50) + six days × 35 = 270 g. Each day left takes its 15 g (20% of 75), the step-up covers it.
    for (const d of p.days.filter((x) => !x.past)) {
      expect(d.proteinG).toBe(90);
      expect(d.why).toContain("achievable_protein");
    }
    // What's left (270 − 90) is under the mess's daily limit (7 × 35 g), so it's let go quietly.
    expect(p.forgiven.proteinG).toBe(180);
    expect(p.limits.proteinG).toBe(180);
    expect(p.why).not.toContain("forgiven_protein");
  });

  it("4 · wedding Sat, losing fat, base 1,800, briefed Monday: Sat 2,300, the other 6 days ≈ 85 lighter", () => {
    expect(classifyDay(WEDDING_SAT, OFFICE)).toBe("feast");
    const base = { kcal: 1800, proteinG: 120, steps: 8000 };
    const p = planWeek(week({ [SAT]: { dayType: "feast", allowanceKcal: 2300 } }, { base }), MON, FLOOR, 3, {
      goal: "lose_fat",
    });
    expect(day(p, SAT).kcal).toBe(2300);
    expect(day(p, SAT).why).toContain("event_allowance");
    const others = p.days.filter((d) => d.date !== SAT);
    expect(others).toHaveLength(6);
    for (const d of others) {
      expect(1800 - d.kcal).toBeGreaterThanOrEqual(83);
      expect(1800 - d.kcal).toBeLessThanOrEqual(84);
      expect(d.kcal).toBeGreaterThanOrEqual(FLOOR);
      expect(d.why).toContain("event_prebank");
    }
    expect(p.forgiven.kcal).toBe(0);
    expect(p.days.reduce((s, d) => s + d.kcal, 0)).toBe(7 * 1800);
  });

  it("4b · an unlogged wedding counts as its allowance, so Sunday isn't told to eat more", () => {
    const base = { kcal: 1800, proteinG: 120, steps: 8000 };
    const lighter = (kcal: number) => ({ actual: onTarget(kcal, 120, 8000) });
    const p = planWeek(
      week(
        {
          [MON]: lighter(1716), [TUE]: lighter(1716), [WED]: lighter(1717), [THU]: lighter(1717), [FRI]: lighter(1717),
          [SAT]: { dayType: "feast", allowanceKcal: 2300 },
        },
        { base },
      ),
      SUN,
      FLOOR,
      3,
      { goal: "lose_fat" },
    );
    expect(day(p, SAT).kcal).toBe(2300);
    expect(day(p, SUN).kcal).toBe(1800 - 83);
  });

  it("5 · flight Thu, other city Thu–Fri: travel and away, no workouts, 2 sessions move to Sat/Sun", () => {
    expect(classifyDay(FLIGHT_THU, OFFICE)).toBe("travel");
    expect(classifyDay(OTHER_CITY_FRI, OFFICE)).toBe("away");
    expect(DAY_RULES.travel.maintenance).toBe(true);
    const pattern = new Set([MON, THU, FRI]);
    const days = (satCanTrain: boolean) =>
      week({
        [MON]: { actual: onTarget(2000, 130, 8000, true) },
        [WED]: { canTrain: false },
        [THU]: { dayType: "travel" },
        [FRI]: { dayType: "away" },
        [SAT]: { canTrain: satCanTrain },
      }).map((d): DayLedgerInput => ({ ...d, patternDay: pattern.has(d.date) }));

    const p = planWeek(days(true), WED, FLOOR, 3);
    expect(day(p, THU)).toMatchObject({ train: false, steps: null, kcal: 2000 });
    expect(day(p, FRI)).toMatchObject({ train: false, kcal: 2000 });
    expect(p.days.filter((d) => d.train).map((d) => d.date)).toEqual([MON, SAT, SUN]);
    expect(day(p, SAT).why).toContain("session_moved");
    expect(p.forgiven.sessions).toBe(0);

    const q = planWeek(days(false), WED, FLOOR, 3);
    expect(q.days.filter((d) => d.train).map((d) => d.date)).toEqual([MON, SUN]);
    expect(q.forgiven.sessions).toBe(1);
    expect(q.why).toContain("forgiven_sessions");
  });

  it("6 · forgot to log Monday: it counts as on target and nothing moves", () => {
    const p = planWeek(week({ [MON]: { actual: null } }), TUE, FLOOR, 0);
    expect(day(p, MON)).toMatchObject({ past: true, kcal: 2000, proteinG: 130, steps: 8000 });
    for (const d of p.days) expect(d).toMatchObject({ kcal: BASE.kcal, proteinG: BASE.proteinG, steps: BASE.steps });
    expect(p.forgiven).toEqual({ kcal: 0, proteinG: 0, steps: 0, sessions: 0 });
    expect(p.days.flatMap((d) => d.why)).toEqual([]);
  });

  it("7 · over by 900 on Sunday: nothing left to absorb it, forgiven; next Monday starts clean", () => {
    const sunOver = week({ [SUN]: { actual: onTarget(2900) } }, { actual: onTarget() });
    const after = planWeek(sunOver, "2026-10-26", FLOOR, 0);
    expect(after.forgiven.kcal).toBe(-900);
    expect(after.why).toContain("forgiven_kcal");

    const next = weekDates("2026-10-26").map((date) => ({ ...sunOver[0]!, date, actual: null }));
    const clean = planWeek(next, "2026-10-26", FLOOR, 0);
    expect(clean.days.every((d) => d.kcal === BASE.kcal && d.why.length === 0)).toBe(true);
    expect(clean.forgiven.kcal).toBe(0);
  });

  it("7b · over 900 on Saturday: Sunday takes 200 of it, 700 is let go", () => {
    const p = planWeek(week({ [SAT]: { actual: onTarget(2900) } }, { actual: onTarget() }), SUN, FLOOR, 0);
    expect(day(p, SUN).kcal).toBe(1800);
    expect(day(p, SUN).why).toContain("over_spread");
    expect(p.forgiven.kcal).toBe(-700);
  });
});

describe("planWeek rules", () => {
  it("away, travel, sick and exam days never absorb", () => {
    const p = planWeek(
      week({
        [MON]: { actual: onTarget(2600) },
        [TUE]: { dayType: "away" },
        [WED]: { dayType: "travel" },
        [THU]: { dayType: "sick" },
        [FRI]: { dayType: "exam" },
      }),
      TUE,
      FLOOR,
      0,
    );
    for (const d of [TUE, WED, THU, FRI]) expect(day(p, d).kcal).toBe(2000);
    expect([SAT, SUN].map((d) => day(p, d).kcal)).toEqual([1800, 1800]);
    expect(p.forgiven.kcal).toBe(-200);
  });

  it("an under is given back at most 150 a day when losing fat, 200 otherwise", () => {
    const days = week({ [MON]: { actual: onTarget(1000) } });
    const lose = planWeek(days, SAT, FLOOR, 0, { goal: "lose_fat" });
    expect([day(lose, SAT).kcal, day(lose, SUN).kcal]).toEqual([2150, 2150]);
    expect(lose.forgiven.kcal).toBe(1000 - 300);
    const keep = planWeek(days, SAT, FLOOR, 0, { goal: "maintain" });
    expect([day(keep, SAT).kcal, day(keep, SUN).kcal]).toEqual([2200, 2200]);
    expect(day(keep, SAT).why).toContain("under_spread");
  });

  it("the floor holds: a base just above it can only drop to it", () => {
    const p = planWeek(week({ [MON]: { actual: onTarget(2500) } }, { base: { kcal: 1550, proteinG: 100, steps: 8000 } }), SAT, 1500, 0);
    expect([day(p, SAT).kcal, day(p, SUN).kcal]).toEqual([1500, 1500]);
  });

  it("a sick day is maintenance and never makes other days lighter", () => {
    const p = planWeek(week({ [WED]: { dayType: "sick", maintenanceKcal: 2400 } }), TUE, FLOOR, 0);
    expect(day(p, WED)).toMatchObject({ kcal: 2400, steps: null });
    expect(day(p, WED).why).toContain("sick_care");
    for (const d of [TUE, THU, FRI, SAT, SUN]) expect(day(p, d).kcal).toBe(2000);
    expect(p.forgiven.kcal).toBe(-400);
    expect(p.why).not.toContain("forgiven_kcal");
  });

  it("protein: a shortfall adds at most 20% a day and only on days that can absorb", () => {
    const p = planWeek(week({ [MON]: { actual: onTarget(2000, 30) } }), TUE, FLOOR, 0);
    for (const d of p.days.filter((x) => !x.past)) {
      expect(d.proteinG).toBeGreaterThan(130);
      expect(d.proteinG).toBeLessThanOrEqual(130 + 26);
    }
    expect(p.days.filter((d) => !d.past).reduce((s, d) => s + d.proteinG - 130, 0)).toBe(100);
    expect(p.forgiven.proteinG).toBe(0);
  });

  it("protein over the target never lowers later days", () => {
    const p = planWeek(week({ [MON]: { actual: onTarget(2000, 200) } }), TUE, FLOOR, 0);
    expect(p.days.filter((d) => !d.past).every((d) => d.proteinG === 130)).toBe(true);
  });

  it("steps: a busy day plans 70% and moves the rest; a shortfall adds ≤ 3,000 a day", () => {
    const p = planWeek(week({ [WED]: { dayType: "busy" } }), TUE, FLOOR, 0);
    expect(day(p, WED).steps).toBe(5600);
    expect(day(p, WED).why).toContain("busy_steps_flex");
    const added = p.days.filter((d) => !d.past && d.date !== WED).reduce((s, d) => s + (d.steps ?? 0) - 8000, 0);
    expect(added).toBe(2400);

    const q = planWeek(week({ [MON]: { actual: onTarget(2000, 130, 0) } }, { actual: null }), SUN, FLOOR, 0);
    expect(day(q, SUN).steps).toBe(8000 + WEEK_STEPS_MAX_ADD);
    expect(q.forgiven.steps).toBe(8000 - WEEK_STEPS_MAX_ADD);
  });

  it(`workouts: never more than ${MAX_TRAINING_STREAK} in a row, counting days already trained`, () => {
    const p = planWeek(
      week({ [MON]: { actual: onTarget(2000, 130, 8000, true) }, [TUE]: { actual: onTarget(2000, 130, 8000, true) } }),
      WED,
      FLOOR,
      5,
    );
    const trained = p.days.filter((d) => d.train).map((d) => d.date);
    expect(trained).not.toContain(WED);
    expect(trained.length).toBe(5);
    expect(p.sessionsDone).toBe(2);
  });

  it("a session already logged today counts as done and today isn't planned again", () => {
    const p = planWeek(week({ [TUE]: { actual: onTarget(2000, 130, 8000, true) } }), TUE, FLOOR, 1);
    expect(p.sessionsDone).toBe(1);
    expect(p.days.filter((d) => d.train).map((d) => d.date)).toEqual([TUE]);
  });

  it("capacity limits what a day absorbs", () => {
    const days = week({ [MON]: { actual: onTarget(2600) } });
    for (const d of days) d.capacity.kcalDown = d.date === SAT ? 50 : 0;
    const p = planWeek(days, SAT, FLOOR, 0);
    expect([day(p, SAT).kcal, day(p, SUN).kcal]).toEqual([1950, 2000]);
    expect(p.forgiven.kcal).toBe(-550);
  });
});

// ── Property tests (seeded, so a failure reproduces) ──

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Case = { days: DayLedgerInput[]; today: string; floor: number; sessions: number; goal: "lose_fat" | "maintain" };

function randomCase(seed: number): Case {
  const r = rng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const floor = int(1200, 1600);
  const todayIdx = int(0, 7); // 7 = the week is over
  const today = todayIdx === 7 ? "2026-10-26" : WEEK[todayIdx]!;
  const days = WEEK.map((date, i): DayLedgerInput => {
    const baseKcal = int(floor, 3200);
    const baseProteinG = int(60, 180);
    const baseSteps = int(3000, 12000);
    const dayType: DayType = r() < 0.5 ? "normal" : pick(DAY_TYPES);
    const capacity = defaultCapacity(dayType, baseProteinG);
    if (r() < 0.3) capacity.kcalDown = int(0, 300);
    if (r() < 0.3) capacity.kcalUp = int(0, 300);
    if (r() < 0.3) capacity.proteinUp = int(0, 40);
    if (r() < 0.3) capacity.stepsUp = int(0, 5000);
    if (r() < 0.3) capacity.canTrain = r() < 0.5;
    const past = i < todayIdx;
    const d: DayLedgerInput = {
      date,
      baseKcal,
      baseProteinG,
      baseSteps,
      dayType,
      capacity,
      actual:
        past && r() < 0.7
          ? {
              kcal: r() < 0.9 ? int(800, 4000) : null,
              proteinG: r() < 0.9 ? int(20, 220) : null,
              steps: r() < 0.9 ? int(0, 20000) : null,
              trained: r() < 0.4,
            }
          : i === todayIdx && r() < 0.3
            ? { kcal: null, proteinG: null, steps: null, trained: true }
            : null,
    };
    if (r() < 0.15) d.allowanceKcal = int(baseKcal - 200, baseKcal + 1200);
    if (r() < 0.3) d.achievableProteinG = int(40, 200);
    if (dayType === "sick" && r() < 0.7) d.maintenanceKcal = int(baseKcal - 300, baseKcal + 700);
    if (r() < 0.4) d.patternDay = true;
    return d;
  });
  return { days, today, floor, sessions: int(0, 6), goal: r() < 0.5 ? "lose_fat" : "maintain" };
}

const RUNS = 1500;
const isEvent = (d: DayLedgerInput) => d.allowanceKcal != null || d.dayType === "feast";
const pBase = (d: DayLedgerInput) => {
  const reach = Math.max(0, Math.min(d.baseProteinG, d.achievableProteinG ?? Infinity));
  return d.dayType === "sick" ? Math.min(reach, sickMinProtein(d.baseProteinG)) : reach;
};
const planned = (c: Case) => planWeek(c.days, c.today, c.floor, c.sessions, { goal: c.goal });

function eachCase(check: (c: Case, p: WeekPlan, seed: number) => void) {
  for (let seed = 1; seed <= RUNS; seed++) {
    const c = randomCase(seed);
    check(c, planned(c), seed);
  }
}

describe(`planWeek properties (${RUNS} seeded weeks)`, () => {
  it("never below the floor on a planned day", () => {
    eachCase((c, p, seed) => {
      for (const d of p.days.filter((x) => !x.past)) expect(d.kcal, `seed ${seed} ${d.date}`).toBeGreaterThanOrEqual(c.floor);
    });
  });

  it("per-day caps: kcal ± 200 (+150 up when losing fat) on absorbing days, events within base … base + 800", () => {
    eachCase((c, p, seed) => {
      const up = c.goal === "lose_fat" ? WEEK_KCAL_MAX_SHIFT_UP_LOSE_FAT : WEEK_KCAL_MAX_SHIFT;
      for (const d of p.days.filter((x) => !x.past)) {
        const src = c.days.find((x) => x.date === d.date)!;
        const shift = d.kcal - src.baseKcal;
        if (isEvent(src)) {
          expect(shift, `seed ${seed}`).toBeGreaterThanOrEqual(0);
          expect(shift, `seed ${seed}`).toBeLessThanOrEqual(800);
        } else if (src.dayType === "sick") expect(shift).toBeGreaterThanOrEqual(0);
        else if (!LEDGER_RULES[src.dayType].absorbs) expect(shift, `seed ${seed}`).toBe(0);
        else {
          expect(shift, `seed ${seed}`).toBeLessThanOrEqual(Math.min(up, src.capacity.kcalUp));
          expect(-shift, `seed ${seed}`).toBeLessThanOrEqual(Math.min(WEEK_KCAL_MAX_SHIFT, src.capacity.kcalDown));
        }
      }
    });
  });

  it("protein never below the day's protein base and adds ≤ 20% of it", () => {
    eachCase((c, p, seed) => {
      for (const d of p.days.filter((x) => !x.past)) {
        const src = c.days.find((x) => x.date === d.date)!;
        const b = pBase(src);
        expect(d.proteinG, `seed ${seed}`).toBeGreaterThanOrEqual(b);
        expect(d.proteinG - b, `seed ${seed}`).toBeLessThanOrEqual(Math.floor(b * WEEK_PROTEIN_MAX_ADD_SHARE));
      }
    });
  });

  it("steps add at most 3,000 a day", () => {
    eachCase((c, p) => {
      for (const d of p.days.filter((x) => !x.past && x.steps != null)) {
        const src = c.days.find((x) => x.date === d.date)!;
        expect(d.steps! - src.baseSteps).toBeLessThanOrEqual(WEEK_STEPS_MAX_ADD);
      }
    });
  });

  it("Σ counted + planned + forgiven = budget (kcal always; protein and steps when the week is short)", () => {
    eachCase((c, p, seed) => {
      const sum = (f: (d: WeekPlan["days"][number]) => number) => p.days.reduce((s, d) => s + f(d), 0);
      expect(sum((d) => d.kcal) + p.forgiven.kcal, `seed ${seed}`).toBe(c.days.reduce((s, d) => s + d.baseKcal, 0));

      // Protein's budget is the real base; what a day can't reach moves on (or is a quiet limit), like a past miss.
      const proteinBudget = c.days.reduce((s, d) => s + d.baseProteinG, 0);
      const src = (date: string) => c.days.find((x) => x.date === date)!;
      const net =
        // D86: a past sick day owes only up to its gentle minimum.
        p.days.filter((d) => d.past).reduce((s, d) => s + (src(d.date).dayType === "sick" ? pBase(src(d.date)) : src(d.date).baseProteinG) - d.proteinG, 0) +
        p.days.filter((d) => !d.past && src(d.date).dayType !== "sick").reduce((s, d) => s + src(d.date).baseProteinG - pBase(src(d.date)), 0);
      if (net >= 0) expect(sum((d) => d.proteinG) + p.forgiven.proteinG, `seed ${seed}`).toBe(proteinBudget);
      expect(p.limits.proteinG).toBeLessThanOrEqual(p.forgiven.proteinG);

      expect(p.forgiven.proteinG).toBeGreaterThanOrEqual(0);
      expect(p.forgiven.steps).toBeGreaterThanOrEqual(0);
      expect(p.forgiven.sessions).toBeGreaterThanOrEqual(0);
    });
  });

  it("only forgives what couldn't be placed: an under means every absorbing day is at its up cap, an over at its down cap", () => {
    eachCase((c, p, seed) => {
      const sickExtra = p.days
        .filter((d) => !d.past)
        .map((d) => [d, c.days.find((x) => x.date === d.date)!] as const)
        .filter(([, s]) => s.dayType === "sick" && !isEvent(s))
        .reduce((s, [d, src]) => s + d.kcal - src.baseKcal, 0);
      const letGo = p.forgiven.kcal + sickExtra;
      if (letGo === 0) return;
      const up = c.goal === "lose_fat" ? WEEK_KCAL_MAX_SHIFT_UP_LOSE_FAT : WEEK_KCAL_MAX_SHIFT;
      for (const d of p.days.filter((x) => !x.past)) {
        const src = c.days.find((x) => x.date === d.date)!;
        if (isEvent(src) || src.dayType === "sick" || !LEDGER_RULES[src.dayType].absorbs) continue;
        const cap =
          letGo > 0
            ? Math.max(0, Math.min(up, src.capacity.kcalUp))
            : Math.max(0, Math.min(WEEK_KCAL_MAX_SHIFT, src.capacity.kcalDown, src.baseKcal - c.floor));
        expect(Math.abs(d.kcal - src.baseKcal), `seed ${seed} ${d.date}`).toBe(Math.floor(cap));
      }
    });
  });

  it("unlogged days are neutral: a missing log plans the same as a log exactly on target", () => {
    eachCase((c, p, seed) => {
      const filled = c.days.map((d): DayLedgerInput => {
        if (d.date >= c.today) return d;
        const target = isEvent(d) ? eventAllowance(d.baseKcal, d.allowanceKcal) : d.baseKcal;
        const a = d.actual;
        return {
          ...d,
          actual: {
            kcal: a?.kcal ?? target,
            proteinG: a?.proteinG ?? pBase(d),
            steps: a?.steps ?? d.baseSteps,
            trained: a?.trained ?? false,
          },
        };
      });
      const q = planWeek(filled, c.today, c.floor, c.sessions, { goal: c.goal });
      expect(q.days, `seed ${seed}`).toEqual(p.days);
      expect(q.forgiven, `seed ${seed}`).toEqual(p.forgiven);
    });
  });

  it("workouts: only on trainable days, never 3 in a row, planned + forgiven = what was left", () => {
    eachCase((c, p, seed) => {
      const trained = new Set(p.days.filter((d) => d.train).map((d) => WEEK.indexOf(d.date)));
      const newly = p.days.filter((d) => d.train && !d.past && !c.days.find((x) => x.date === d.date)!.actual?.trained);
      const fresh = new Set(newly.map((d) => WEEK.indexOf(d.date)));
      // A run of 3 the user already trained is history; a run that includes a planned day is a bug.
      for (const i of trained) {
        const run = [i, i + 1, i + 2];
        if (run.every((n) => trained.has(n))) expect(run.some((n) => fresh.has(n)), `seed ${seed}`).toBe(false);
      }
      for (const d of newly) {
        const src = c.days.find((x) => x.date === d.date)!;
        expect(LEDGER_RULES[src.dayType].canTrain && src.capacity.canTrain, `seed ${seed}`).toBe(true);
      }
      const left = Math.max(0, c.sessions - p.sessionsDone);
      expect(newly.length + p.forgiven.sessions, `seed ${seed}`).toBe(left);
    });
  });

  it("past days report what's counted, and past days never change", () => {
    eachCase((c, p) => {
      for (const d of p.days.filter((x) => x.past)) {
        const src = c.days.find((x) => x.date === d.date)!;
        expect(d.train).toBe(Boolean(src.actual?.trained));
        if (src.actual?.kcal != null) expect(d.kcal).toBe(src.actual.kcal);
      }
    });
  });
});

describe("what moved and why (adjust)", () => {
  const kabir = { kcal: 2750, proteinG: 135, steps: 10000 };

  it("Kabir: today's 68 g realistic protein is shared by today (≤ +13) and Wed–Sun, each day says where it came from", () => {
    const p = planWeek(week({ [TUE]: { achievableProteinG: 68 } }, { base: kabir }), TUE, FLOOR, 3);
    const tue = day(p, TUE);
    expect(tue.proteinG).toBeGreaterThan(68);
    expect(tue.proteinG).toBeLessThanOrEqual(68 + 13);
    expect(tue.adjust?.proteinG).toMatchObject({ from: 68, to: tue.proteinG, causes: [{ date: TUE, kind: "limited" }] });
    const later = [WED, THU, FRI, SAT, SUN].map((d) => day(p, d));
    expect(tue.proteinG - 68 + later.reduce((s, d) => s + d.proteinG - 135, 0)).toBe(67);
    for (const d of later) {
      expect(d.proteinG).toBeLessThanOrEqual(135 + 27);
      expect(d.adjust?.proteinG).toMatchObject({ from: 135, causes: [{ date: TUE, kind: "limited" }] });
    }
    expect(p.forgiven.proteinG).toBe(0);
  });

  it("D86 Kabir, fever Tuesday: aim for at least 81 of 135 g; the other 54 g is let go, nothing moves to later days", () => {
    const p = planWeek(week({ [TUE]: { dayType: "sick", maintenanceKcal: 2750 } }, { base: kabir }), TUE, FLOOR, 3);
    const tue = day(p, TUE);
    expect(tue.proteinG).toBe(81);
    expect(tue.sick).toEqual({ minG: 81, baseG: 135 });
    expect(tue.adjust?.proteinG).toBeUndefined();
    for (const d of [WED, THU, FRI, SAT, SUN]) expect(day(p, d).proteinG).toBe(135);
    expect(p.forgiven.proteinG).toBe(54);
    expect(p.why).not.toContain("forgiven_protein");
  });

  it("D86 a sick Tuesday that reached its 81 g minimum moves nothing; one at 50 g moves only the 31 g below it", () => {
    const sick = (proteinG: number) => week({ [TUE]: { dayType: "sick", actual: onTarget(2750, proteinG, 2000) } }, { base: kabir });
    const ok = planWeek(sick(81), THU, FLOOR, 0);
    for (const d of [THU, FRI, SAT, SUN]) expect(day(ok, d).proteinG).toBe(135);
    expect(day(ok, TUE).sick).toEqual({ minG: 81, baseG: 135 });
    const short = planWeek(sick(50), THU, FLOOR, 0);
    const later = [THU, FRI, SAT, SUN].map((d) => day(short, d));
    expect(later.reduce((s, d) => s + d.proteinG - 135, 0)).toBe(31);
    expect(later.find((d) => d.adjust?.proteinG)?.adjust?.proteinG?.causes).toEqual([{ date: TUE, kind: "short" }]);
  });

  it("Kabir, home veg Wednesday (109 g realistic): Wednesday takes moved protein past 109, up to +21", () => {
    const p = planWeek(week({ [MON]: { actual: onTarget(2750, 100, 10000) }, [WED]: { achievableProteinG: 109 } }, { base: kabir }), TUE, FLOOR, 3);
    const wed = day(p, WED);
    expect(wed.proteinG).toBeGreaterThan(109);
    expect(wed.proteinG).toBeLessThanOrEqual(109 + 21);
    expect(wed.adjust?.proteinG?.causes).toEqual(expect.arrayContaining([{ date: MON, kind: "short" }, { date: WED, kind: "limited" }]));
  });

  it("a short Tuesday (logged) raises Sunday's protein, naming Tuesday", () => {
    const p = planWeek(week({ [TUE]: { actual: onTarget(2750, 100, 10000) } }, { base: kabir }), SUN, FLOOR, 0);
    expect(day(p, SUN).adjust?.proteinG).toEqual({ from: 135, to: 162, causes: [{ date: TUE, kind: "short" }] });
    expect(p.forgiven.proteinG).toBe(35 - 27);
  });

  it("an over on Tuesday makes later days lighter, naming Tuesday; an event names the event day", () => {
    const over = planWeek(week({ [TUE]: { actual: onTarget(3250) } }), THU, FLOOR, 0);
    expect(day(over, THU).adjust?.kcal).toMatchObject({ from: 2000, causes: [{ date: TUE, kind: "over" }] });
    expect(day(over, THU).adjust!.kcal!.to).toBeLessThan(2000);
    const wedding = planWeek(week({ [SAT]: { dayType: "feast", allowanceKcal: 2500 } }), MON, FLOOR, 0);
    expect(day(wedding, MON).adjust?.kcal?.causes).toEqual([{ date: SAT, kind: "event" }]);
  });

  it("a busy day's steps say where the rest went; the receiving days name the busy day", () => {
    const p = planWeek(week({ [WED]: { dayType: "busy" } }), TUE, FLOOR, 0);
    expect(day(p, WED).adjust?.steps).toMatchObject({ from: 8000, to: 5600, causes: [{ date: WED, kind: "busy" }] });
    expect(day(p, WED).adjust!.steps!.movedTo!.length).toBeGreaterThan(0);
    expect(day(p, THU).adjust?.steps?.causes).toEqual([{ date: WED, kind: "busy" }]);
  });

  it("a usual Wednesday workout that didn't happen moves to the next free day and says it was missed", () => {
    const pattern = new Set([MON, WED, FRI]);
    const days = week({ [MON]: { actual: onTarget(2000, 130, 8000, true) }, [WED]: { actual: onTarget() } }).map((d) => ({ ...d, patternDay: pattern.has(d.date) }));
    const p = planWeek(days, THU, FLOOR, 3);
    const moved = p.days.find((d) => d.adjust?.train);
    expect(moved?.date).toBe(THU);
    expect(moved?.adjust?.train).toEqual({ movedFrom: [WED], missed: true });
    expect(day(p, FRI).train).toBe(true);
  });
});

describe("picked numbers, Plan A/B and starting fresh", () => {
  const kabir = { kcal: 2750, proteinG: 135, steps: 10000 };
  // Monday came in 35 g, 400 kcal and 3,000 steps short; today is Tuesday.
  const shortMon = { [MON]: { actual: onTarget(2350, 100, 7000) } };

  it("a picked number stays put; the rest of the week moves around it and names the day", () => {
    const p = planWeek(week({ ...shortMon, [WED]: { chosen: { proteinG: 150, kcal: 2900, steps: 12000 } } }, { base: kabir }), TUE, FLOOR, 3);
    const wed = day(p, WED);
    expect(wed).toMatchObject({ proteinG: 150, kcal: 2900, steps: 12000 });
    expect(wed.why).toContain("chosen_target");
    expect(wed.adjust?.proteinG).toMatchObject({ from: 135, to: 150, causes: [{ date: WED, kind: "chosen" }] });
    // Wednesday paid back 15 g of Monday's 35 g; the other days share the last 20 g.
    const others = [TUE, THU, FRI, SAT, SUN].reduce((s, d) => s + day(p, d).proteinG - 135, 0);
    expect(others).toBe(20);
    // Wednesday took 150 kcal of Monday's 400 under and 2,000 of its 3,000 steps.
    expect([TUE, THU, FRI, SAT, SUN].reduce((s, d) => s + day(p, d).kcal - 2750, 0)).toBe(250);
    expect([TUE, THU, FRI, SAT, SUN].reduce((s, d) => s + (day(p, d).steps ?? 0) - 10000, 0)).toBe(1000);
  });

  it("a day picked lower moves its gap to the others, naming it", () => {
    const p = planWeek(week({ [WED]: { chosen: { proteinG: 110 } } }, { base: kabir }), TUE, FLOOR, 3);
    expect(day(p, WED).proteinG).toBe(110);
    expect(day(p, WED).adjust?.proteinG?.movedTo?.length).toBeGreaterThan(0);
    expect(day(p, THU).adjust?.proteinG?.causes).toContainEqual({ date: WED, kind: "chosen" });
    expect([TUE, THU, FRI, SAT, SUN].reduce((s, d) => s + day(p, d).proteinG - 135, 0)).toBe(25);
  });

  it("picked numbers are kept inside safe limits; a past day's pick is ignored", () => {
    const row = week({}, { base: kabir }).find((d) => d.date === WED)!;
    expect(chosenLimits(row, FLOOR)).toEqual({ kcal: [2550, 2950], protein: [68, 162], steps: [5000, 13000] });
    const p = planWeek(week({ [MON]: { chosen: { proteinG: 10 } }, [WED]: { chosen: { proteinG: 400, kcal: 900, steps: 99999 } } }, { base: kabir }), TUE, FLOOR, 3);
    expect(day(p, WED)).toMatchObject({ proteinG: 162, kcal: 2550, steps: 13000 });
    expect(day(p, MON).proteinG).toBe(135);
  });

  it("Plan A keeps the week even, Plan B catches up faster, and the usual is base", () => {
    const ledger = week({ ...shortMon, [WED]: { achievableProteinG: 109 } }, { base: kabir });
    const p = planWeek(ledger, TUE, FLOOR, 3);
    const o = dayOptions(p, ledger.find((d) => d.date === WED)!, FLOOR);
    expect(o.usual).toEqual({ kcal: 2750, proteinG: 135, steps: 10000 });
    expect(o.even).toEqual({ kcal: day(p, WED).kcal, proteinG: day(p, WED).proteinG, steps: day(p, WED).steps });
    // Plan B: Wednesday's own 26 g plus Monday's 35 g, from 109 → 162 (the most a pick may be).
    expect(o.faster).toEqual({ kcal: 2950, proteinG: 162, steps: 13000 });
    // Nothing owed: Plan A is the usual, no Plan B.
    const calm = week({}, { base: kabir });
    const q = dayOptions(planWeek(calm, TUE, FLOOR, 3), calm.find((d) => d.date === WED)!, FLOOR);
    expect(q.even).toEqual(q.usual);
    expect(q.faster).toBeNull();
  });

  it("start fresh: earlier days count as on target, workouts done still count", () => {
    const ledger = week({ [MON]: { actual: onTarget(2350, 100, 7000, true) } }, { base: kabir });
    const fresh = planWeek(freshLedger(ledger, WED), TUE, FLOOR, 3);
    expect(fresh.owed).toEqual({ kcal: 0, proteinG: 0, steps: 0 });
    for (const d of fresh.days.filter((x) => !x.past)) expect(d).toMatchObject({ kcal: 2750, proteinG: 135, steps: 10000 });
    expect(fresh.sessionsDone).toBe(1);
    expect(planWeek(freshLedger(ledger, null), TUE, FLOOR, 3).owed.proteinG).toBe(35);
  });
});
