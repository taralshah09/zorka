// D85 · AI-planned weeks, code-guarded: whatever the model proposes, every number stays inside the hard limits, workouts
// only land where the day can hold one, and a metric whose week drifts falls back to the code plan.
import { describe, expect, it } from "vitest";

import { AI_WEEK_TOLERANCE, applyGuarded, dayLimits, guardAiWeek, type AiWeek } from "../../shared/domain/aiPlan.js";
import { DAY_TYPES } from "../../shared/domain/dayType.js";
import { PROTEIN_STAPLES } from "../../shared/domain/eatOptions.js";
import { NO_FACTS } from "../../shared/domain/memory.js";
import { planDay } from "../../shared/domain/planDay.js";
import { defaultCapacity, MAX_TRAINING_STREAK, planWeek, type DayLedgerInput } from "../../shared/domain/week.js";
import { at, BASE, FRI, MON, OFFICE, onTarget, SAT, SUN, THU, TUE, WED, WEEK, week, facts } from "./fixtures/lifeScenarios.js";

const FLOOR = 1500;
const guard = (ai: AiWeek | null, ledger: DayLedgerInput[], today = TUE, sessions = 3, goal: "lose_fat" | "maintain" = "maintain") =>
  guardAiWeek(ai, { ledger, today, floorKcal: FLOOR, goal, sessionsTarget: sessions, code: planWeek(ledger, today, FLOOR, sessions, { goal }) });
/** A full Tue–Sun proposal (a day the model leaves out uses the code plan, so tests give every day). */
const ai = (days: Partial<AiWeek["days"][number]>[]): AiWeek => ({
  days: WEEK.slice(1).map((date, i) => ({ date, kcal: 2000, proteinG: 130, steps: 8000, train: false, ...days[i] })),
});

describe("guardAiWeek", () => {
  it("a sane proposal passes through with its reasons", () => {
    const g = guard(ai([{ kcal: 1900, proteinG: 140, steps: 9000, train: true, reason: "  Lighter today   to make room for Saturday. " }, {}, { train: true }]), week());
    expect(g.days[0]).toEqual({ date: TUE, kcal: 1900, proteinG: 140, steps: 9000, train: true, reason: "Lighter today to make room for Saturday.", clamped: [] });
    expect(g.fellBack).toEqual([]);
    expect(g.days.filter((d) => d.train).map((d) => d.date)).toEqual([TUE, THU]);
  });

  it("clamps kcal to the floor and ±200, protein to realistic…+20%, steps to 50%…+3,000", () => {
    const g = guard(ai([{ kcal: 900, proteinG: 300, steps: 99000 }, { kcal: 2900, proteinG: 10, steps: 100 }]), week());
    expect(g.days[0]).toMatchObject({ kcal: 1800, proteinG: 156, steps: 11000, clamped: ["kcal", "proteinG", "steps"] });
    expect(g.days[1]).toMatchObject({ kcal: 2200, proteinG: 130, steps: 4000 });
  });

  it("losing fat: at most +150; events up to +800; sick at or above maintenance; protein from the realistic number to 20% over it", () => {
    const ledger = week({
      [TUE]: { dayType: "feast", allowanceKcal: 2500 },
      [WED]: { dayType: "sick", maintenanceKcal: 2300 },
      [THU]: { achievableProteinG: 80 },
    });
    const row = (date: string) => ledger.find((d) => d.date === date)!;
    expect(dayLimits(row(TUE), FLOOR, "lose_fat").kcal).toEqual([2000, 2800]);
    expect(dayLimits(row(WED), FLOOR, "lose_fat").kcal).toEqual([2300, 2500]);
    expect(dayLimits(row(THU), FLOOR, "lose_fat").protein).toEqual([80, 96]);
    expect(dayLimits(row(FRI), FLOOR, "lose_fat").kcal).toEqual([1800, 2150]);
    // A proposal inside those limits that matches the code plan's week is kept; the clamps still apply per day.
    const code = planWeek(ledger, TUE, FLOOR, 3, { goal: "lose_fat" });
    const near = { days: code.days.filter((d) => !d.past).map((d) => ({ date: d.date, kcal: d.kcal, proteinG: d.date === THU ? 60 : d.proteinG, steps: d.steps, train: d.train })) };
    const g = guardAiWeek(near, { ledger, today: TUE, floorKcal: FLOOR, goal: "lose_fat", sessionsTarget: 3, code });
    expect(g.fellBack).toEqual([]);
    expect(g.days.find((d) => d.date === THU)).toMatchObject({ proteinG: 80, clamped: ["proteinG"] });
    // Ignoring the event and leaving every other day at base doesn't add up: kcal falls back to the code plan.
    const off = guard(ai([{ kcal: 3500 }, { kcal: 1800 }, {}, { kcal: 2400 }]), ledger, TUE, 3, "lose_fat");
    expect(off.fellBack).toContain("kcal");
    expect(off.days.map((d) => d.kcal)).toEqual(code.days.filter((d) => !d.past).map((d) => d.kcal));
  });

  it("D86 a sick day's protein is its gentle minimum, whatever the model says", () => {
    const ledger = week({ [TUE]: { dayType: "sick", maintenanceKcal: 2300 } });
    const min = Math.round(ledger[1]!.baseProteinG * 0.6);
    expect(dayLimits(ledger[1]!, FLOOR, "maintain").protein).toEqual([min, min]);
    const g = guard(ai([{ proteinG: 160 }]), ledger).days[0]!;
    expect(g.proteinG).toBe(min);
    expect(g.clamped).toContain("proteinG");
  });

  it("no step goal on a travel or sick day, whatever the model says", () => {
    const g = guard(ai([{ steps: 9000 }]), week({ [TUE]: { dayType: "travel" } }));
    expect(g.days[0]).toMatchObject({ steps: null, clamped: ["steps"] });
  });

  it("workouts: only trainable days, never more than are left, never 3 in a row", () => {
    const ledger = week({
      [MON]: { actual: onTarget(2000, 130, 8000, true) },
      [WED]: { dayType: "away" },
      [FRI]: { canTrain: false },
    });
    const g = guard(ai([{ train: true }, { train: true }, { train: true }, { train: true }, { train: true }, { train: true }]), ledger, TUE, 3);
    const train = g.days.filter((d) => d.train).map((d) => d.date);
    expect(train).not.toContain(WED);
    expect(train).not.toContain(FRI);
    expect(train.length).toBeLessThanOrEqual(2);
    expect(train).toEqual([TUE, THU]);
    // Mon (done) + Tue + Wed would be 3 in a row if Wed could train: Tue and a later day instead.
    const g2 = guard(ai([{ train: true }, { train: true }]), week({ [MON]: { actual: onTarget(2000, 130, 8000, true) } }), TUE, 4);
    expect(g2.days.filter((d) => d.train).map((d) => d.date)).toEqual([TUE]);
  });

  it("a week that drifts more than 5% falls back to the code plan for that metric", () => {
    const g = guard(ai(Array(6).fill({ kcal: 1800 })), week());
    expect(g.fellBack).toEqual(["kcal"]);
    expect(g.days.every((d) => d.kcal === 2000)).toBe(true);
    // Protein and steps only fall back when the week is short, not when the model asks for more.
    const more = guard(ai(Array(6).fill({ proteinG: 150, steps: 10000 })), week());
    expect(more.fellBack).toEqual([]);
  });

  it("missing days, garbage values and no AI at all use the code plan", () => {
    const code = guard(null, week({ [MON]: { actual: onTarget(2600) } }), TUE);
    expect(code.days.map((d) => d.kcal)).toEqual(planWeek(week({ [MON]: { actual: onTarget(2600) } }), TUE, FLOOR, 3).days.filter((d) => !d.past).map((d) => d.kcal));
    const junk = guard({ days: [{ date: TUE, kcal: NaN, proteinG: "x" as unknown as number, steps: null, train: false }, { date: "nope" } as never] }, week());
    expect(junk.days[0]).toMatchObject({ kcal: 2000, proteinG: 130 });
  });

  it("applyGuarded keeps past days and swaps the code's 'since' record for the AI's reason", () => {
    const ledger = week({ [MON]: { actual: onTarget(2400) } });
    const code = planWeek(ledger, TUE, FLOOR, 0);
    const g = guard(ai([{ kcal: 1900, reason: "Monday went over." }]), ledger, TUE, 0);
    const w = applyGuarded(code, g);
    expect(w.days.find((d) => d.date === MON)).toEqual(code.days.find((d) => d.date === MON));
    const tue = w.days.find((d) => d.date === TUE)!;
    expect(tue).toMatchObject({ kcal: 1900, ai: { reason: "Monday went over.", guarded: [] } });
    expect(tue.adjust).toBeUndefined();
  });
});

// Seeded property test: random model output can never break a limit.
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

describe("guardAiWeek properties (1,000 random proposals)", () => {
  it("every guarded number is inside its day's limits; workouts are legal; the week adds up or fell back", () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const r = rng(seed);
      const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
      const todayIdx = int(0, 6);
      const today = WEEK[todayIdx]!;
      const ledger = WEEK.map((date, i): DayLedgerInput => {
        const dayType = r() < 0.6 ? "normal" : DAY_TYPES[int(0, DAY_TYPES.length - 1)]!;
        const row: DayLedgerInput = { date, baseKcal: int(1600, 3000), baseProteinG: int(80, 170), baseSteps: int(4000, 12000), dayType, capacity: defaultCapacity(dayType, 120), actual: i < todayIdx && r() < 0.6 ? { kcal: int(1000, 3500), proteinG: int(30, 200), steps: int(0, 15000), trained: r() < 0.4 } : null };
        if (r() < 0.3) row.capacity.canTrain = false;
        if (r() < 0.2) row.achievableProteinG = int(50, 180);
        if (dayType === "sick") row.maintenanceKcal = int(1800, 3000);
        if (r() < 0.1) row.allowanceKcal = row.baseKcal + int(0, 900);
        return row;
      });
      const proposal: AiWeek = {
        days: WEEK.map((date) => ({ date, kcal: int(-500, 6000), proteinG: int(-50, 500), steps: r() < 0.2 ? null : int(-100, 60000), train: r() < 0.6 })),
      };
      const sessions = int(0, 6);
      const code = planWeek(ledger, today, FLOOR, sessions, {});
      const g = guardAiWeek(proposal, { ledger, today, floorKcal: FLOOR, goal: null, sessionsTarget: sessions, code });
      for (const d of g.days) {
        const row = ledger.find((x) => x.date === d.date)!;
        const lim = dayLimits(row, FLOOR, null);
        if (!g.fellBack.includes("kcal")) {
          expect(d.kcal, `seed ${seed}`).toBeGreaterThanOrEqual(lim.kcal[0]);
          expect(d.kcal, `seed ${seed}`).toBeLessThanOrEqual(lim.kcal[1]);
        }
        if (!g.fellBack.includes("proteinG")) {
          expect(d.proteinG, `seed ${seed}`).toBeGreaterThanOrEqual(lim.protein[0]);
          expect(d.proteinG, `seed ${seed}`).toBeLessThanOrEqual(lim.protein[1]);
        }
        if (!lim.steps) expect(d.steps).toBeNull();
        if (d.train) expect(lim.canTrain, `seed ${seed}`).toBe(true);
        expect(d.kcal).toBeGreaterThanOrEqual(Math.min(FLOOR, row.baseKcal));
      }
      const trained = new Set([
        ...ledger.filter((d) => d.actual?.trained && d.date <= today).map((d) => WEEK.indexOf(d.date)),
        ...g.days.filter((d) => d.train).map((d) => WEEK.indexOf(d.date)),
      ]);
      const done = ledger.filter((d) => d.actual?.trained && d.date <= today).length;
      expect(g.days.filter((d) => d.train).length, `seed ${seed}`).toBeLessThanOrEqual(Math.max(0, sessions - done));
      for (const i of g.days.filter((d) => d.train).map((d) => WEEK.indexOf(d.date)))
        for (const start of [i - 2, i - 1, i]) {
          const run = Array.from({ length: MAX_TRAINING_STREAK + 1 }, (_, k) => start + k);
          expect(run.every((n) => trained.has(n)), `seed ${seed}`).toBe(false);
        }
      const budget = ledger.reduce((s, d) => s + d.baseKcal, 0);
      const drift = g.days.reduce((s, d) => s + d.kcal, 0) - code.days.filter((d) => !d.past).reduce((s, d) => s + d.kcal, 0);
      expect(Math.abs(drift), `seed ${seed}`).toBeLessThanOrEqual(AI_WEEK_TOLERANCE * budget + 1e-9);
    }
  });
});

describe("planDay with an AI week", () => {
  const input = (aiWeek: AiWeek | null) => ({
    date: TUE,
    today: TUE,
    now: 0,
    base: { kcal: BASE.kcal, proteinG: BASE.proteinG, steps: BASE.steps, floorKcal: FLOOR, waterGlasses: 8, goal: "maintain" as const },
    standing: OFFICE,
    facts: facts({ blocks: [{ from: at(9, 30), to: at(18), kind: "work" }] }),
    patterns: NO_FACTS,
    ledger: week(),
    routines: [{ id: "push", name: "Push day", minutes: 50 }],
    candidates: [],
    diet: "veg" as const,
    staples: PROTEIN_STAPLES,
    sessionsTarget: 3,
    ai: aiWeek,
  });

  it("the AI's guarded numbers become today's targets and schedule; source says so", () => {
    const code = planDay(input(null));
    expect(code.source).toBe("code");
    expect(code.items.some((i) => i.kind === "workout")).toBe(true);
    const p = planDay(input(ai([{ kcal: 2150, proteinG: 127, steps: 9500, train: false, reason: "Rest today, train Thursday." }])));
    expect(p.source).toBe("ai");
    expect(p.targets).toMatchObject({ kcal: 2150, proteinG: 127, steps: 9500 });
    expect(p.items.some((i) => i.kind === "workout")).toBe(false);
    expect(p.week.days.find((d) => d.date === TUE)!.ai).toEqual({ reason: "Rest today, train Thursday.", guarded: [] });
    expect(p.ai).toEqual({ fellBack: [], summary: null });
  });

  it("protein may go past what today's meals reach, by 20% at most; the step-up covers the gap", () => {
    const p = planDay(input(ai([{ proteinG: 400 }])));
    const pBase = Math.min(BASE.proteinG, p.protein.achievableG);
    expect(p.targets.proteinG).toBe(Math.round(pBase * 1.2));
    if (p.targets.proteinG > p.protein.achievableG) expect(p.protein.stepUp).not.toBeNull();
    expect(p.week.days.find((d) => d.date === TUE)!.ai!.guarded).toContain("proteinG");
  });

  it("an empty AI answer is the code plan", () => {
    expect(planDay(input({ days: [] })).source).toBe("code");
  });

  it("a reason never changes a number: an unsafe proposal is guarded", () => {
    const p = planDay(input(ai([{ kcal: 900, reason: "Skip dinner." }])));
    expect(p.targets.kcal).toBe(1800);
    expect(p.week.days.find((d) => d.date === TUE)!.ai!.guarded).toContain("kcal");
  });
});

void SAT;
void SUN;
