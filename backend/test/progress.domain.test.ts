// P27–P29 progress engine (shared/domain/progress.ts) and the P28 weekly check-in (shared/domain/targets.ts).
import { describe, expect, it } from "vitest";

import {
  addDays,
  checkinWindow,
  datesBetween,
  goalProgress,
  goalReached,
  phaseSummary,
  trendOn,
  trendSeries,
  weekday,
  weeklyTrendChange,
} from "../../shared/domain/progress.js";
import { MAX_WEEKLY_CHANGE_KCAL, macrosFor, weeklyCheckin, type CheckinInput } from "../../shared/domain/targets.js";

describe("trend weight (EMA, α 0.1, time-aware gaps)", () => {
  it("starts at the first weigh-in and moves 10% of the way on the next day", () => {
    const s = trendSeries([
      { date: "2026-10-01", kg: 80 },
      { date: "2026-10-02", kg: 79 },
    ]);
    expect(s[0]).toEqual({ date: "2026-10-01", scaleKg: 80, trendKg: 80 });
    expect(s[1]!.trendKg).toBeCloseTo(79.9, 10);
  });

  it("moves 1 − 0.9^n after an n-day gap instead of inventing the missing days", () => {
    const s = trendSeries([
      { date: "2026-10-01", kg: 80 },
      { date: "2026-10-06", kg: 78 },
    ]);
    expect(s[1]!.trendKg).toBeCloseTo(80 - 2 * (1 - 0.9 ** 5), 10);
    expect(s).toHaveLength(2);
  });

  it("averages several weigh-ins on one day and accepts unsorted input", () => {
    const s = trendSeries([
      { date: "2026-10-02", kg: 79 },
      { date: "2026-10-01", kg: 80.4 },
      { date: "2026-10-01", kg: 79.6 },
    ]);
    expect(s.map((p) => p.date)).toEqual(["2026-10-01", "2026-10-02"]);
    expect(s[0]!.scaleKg).toBeCloseTo(80, 10);
  });

  it("ignores invalid weights", () => {
    expect(
      trendSeries([
        { date: "2026-10-01", kg: 0 },
        { date: "2026-10-01", kg: Number.NaN },
      ]),
    ).toEqual([]);
  });

  it("holds the trend flat between weigh-ins and is null before the first", () => {
    const s = trendSeries([
      { date: "2026-10-01", kg: 80 },
      { date: "2026-10-05", kg: 79 },
    ]);
    expect(trendOn(s, "2026-09-30")).toBeNull();
    expect(trendOn(s, "2026-10-03")).toBe(80);
    expect(trendOn(s, "2026-10-20")).toBe(s[1]!.trendKg);
  });

  it("reports the change over the last 7 days", () => {
    const s = trendSeries(datesBetween("2026-10-01", "2026-10-15").map((date, i) => ({ date, kg: 80 - i * 0.1 })));
    const change = weeklyTrendChange(s, "2026-10-15")!;
    expect(change).toBeLessThan(0);
    expect(change).toBeCloseTo(trendOn(s, "2026-10-15")! - trendOn(s, "2026-10-08")!, 10);
    expect(weeklyTrendChange(s, "2026-10-03")).toBeNull();
  });
});

describe("calendar helpers", () => {
  it("adds days across months and leap years", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(datesBetween("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });

  it("puts the check-in on the latest Sunday, covering the 7 days before it", () => {
    expect(weekday("2026-10-11")).toBe(0);
    const sunday = { checkinDate: "2026-10-11", start: "2026-10-04", end: "2026-10-10" };
    expect(checkinWindow("2026-10-11")).toEqual(sunday);
    expect(checkinWindow("2026-10-14")).toEqual(sunday);
    expect(checkinWindow("2026-10-17")).toEqual(sunday);
    expect(checkinWindow("2026-10-18").checkinDate).toBe("2026-10-18");
  });
});

describe("weekly check-in", () => {
  // IDEATION's example: trend −0.4 kg, ~2,000 kcal eaten → burn ≈ 2,440; the plan's 550 deficit wants 1,890, so the
  // change is capped at −150 → 1,950.
  const base: CheckinInput = {
    goal: "lose_fat",
    loggedKcal: [2000, 2000, 2000, 2000, 2000, 2000, 2000],
    trendStartKg: 75,
    trendEndKg: 74.6,
    weighedInWeek: true,
    currentKcal: 2100,
    floorKcal: 1700,
    adjustmentKcal: -550,
  };

  const ready = (input: CheckinInput) => {
    const r = weeklyCheckin(input);
    if (r.status !== "ready") throw new Error(`expected ready, got ${r.reason}`);
    return r;
  };

  it("estimates burn from intake and trend, and caps the change at 150 kcal", () => {
    const r = ready(base);
    expect(r.estimatedBurnKcal).toBeCloseTo(2000 + (0.4 * 7700) / 7, 6);
    expect(r.newKcal).toBe(1950);
    expect(r.changeKcal).toBe(-MAX_WEEKLY_CHANGE_KCAL);
    expect(r.capped).toBe(true);
    expect(r.onTrack).toBe(true);
    expect(r.loggedDays).toBe(7);
  });

  it("recalculates macros for the new target at the current trend weight", () => {
    const r = ready(base);
    expect({ proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG }).toEqual(macrosFor(1950, 2.0 * 74.6, 74.6));
    expect(r.proteinG).toBe(150);
  });

  it("leaves the target alone when burn matches the plan", () => {
    // burn = 2100 + 0.5 × 1100 = 2650; wanted 2650 − 550 = 2100 → no change
    const r = ready({ ...base, loggedKcal: Array(6).fill(2100), trendEndKg: 74.5 });
    expect(r.changeKcal).toBe(0);
    expect(r.capped).toBe(false);
  });

  it("makes an uncapped change when the gap is small", () => {
    // burn = 2000 + 0.5 × 1100 = 2550; wanted 2000 → −100
    const r = ready({ ...base, trendEndKg: 74.5 });
    expect(r.newKcal).toBe(2000);
    expect(r.capped).toBe(false);
  });

  it("raises the target when the user is losing faster than planned", () => {
    // burn = 2000 + 1.2 × 1100 = 3320; wanted 2770 → +670 → +150
    expect(ready({ ...base, trendEndKg: 73.8 }).newKcal).toBe(2250);
  });

  it("never goes under the calorie floor", () => {
    const r = ready({ ...base, currentKcal: 1550, floorKcal: 1500, trendEndKg: 75.2 });
    expect(r.newKcal).toBe(1500);
    expect(r.floorApplied).toBe(true);
    expect(r.onTrack).toBe(false);
  });

  it("keeps the cap when the current target isn't a multiple of 50", () => {
    expect(ready({ ...base, currentKcal: 2075, trendEndKg: 73.8 }).newKcal).toBe(2225);
  });

  it("needs 5 of 7 days logged", () => {
    expect(weeklyCheckin({ ...base, loggedKcal: [2000, 2000, 2000, 2000] })).toEqual({
      status: "not_enough_data",
      reason: "days",
      loggedDays: 4,
    });
    expect(weeklyCheckin({ ...base, loggedKcal: [] })).toMatchObject({ status: "not_enough_data", loggedDays: 0 });
    expect(weeklyCheckin({ ...base, loggedKcal: [2000, 2000, 2000, 2000, 2000] }).status).toBe("ready");
  });

  it("needs a weigh-in during the week and a trend before it", () => {
    expect(weeklyCheckin({ ...base, weighedInWeek: false })).toMatchObject({
      status: "not_enough_data",
      reason: "weight",
    });
    expect(weeklyCheckin({ ...base, trendStartKg: null })).toMatchObject({
      status: "not_enough_data",
      reason: "weight",
    });
  });

  it("judges on-track by goal", () => {
    expect(ready({ ...base, goal: "build_muscle", adjustmentKcal: 250, trendEndKg: 75.2 }).onTrack).toBe(true);
    expect(ready({ ...base, goal: "maintain", adjustmentKcal: 0, trendEndKg: 75.1 }).onTrack).toBe(true);
    expect(ready({ ...base, goal: "maintain", adjustmentKcal: 0, trendEndKg: 75.5 }).onTrack).toBe(false);
  });
});

describe("phases", () => {
  it("counts the goal as reached when the trend crosses the target", () => {
    expect(goalReached("lose_fat", 72, 72.4)).toBe(false);
    expect(goalReached("lose_fat", 72, 71.9)).toBe(true);
    expect(goalReached("build_muscle", 72, 72)).toBe(true);
    expect(goalReached("maintain", 72, 60)).toBe(false);
    expect(goalReached("lose_fat", null, 60)).toBe(false);
  });

  it("measures progress to the goal, clamped to 0–1", () => {
    expect(goalProgress(80, 72, 76)).toBe(0.5);
    expect(goalProgress(80, 72, 81)).toBe(0);
    expect(goalProgress(80, 72, 70)).toBe(1);
    expect(goalProgress(null, 72, 70)).toBeNull();
  });

  it("summarises a closed phase", () => {
    const series = trendSeries([
      { date: "2026-08-01", kg: 80 },
      { date: "2026-10-01", kg: 76 },
    ]);
    const s = phaseSummary({
      start: "2026-08-01",
      end: "2026-10-02",
      series,
      intake: [
        { date: "2026-07-31", kcal: 9999, proteinG: 999 },
        { date: "2026-08-02", kcal: 2000, proteinG: 130 },
        { date: "2026-08-03", kcal: 1800, proteinG: 146 },
      ],
      workouts: 31,
      prs: 4,
      distanceM: 42_195,
    });
    expect(s).toMatchObject({ days: 63, weeks: 9, startTrendKg: 80, loggedDays: 2, avgKcal: 1900, avgProteinG: 138 });
    expect(s.changeKg).toBeCloseTo(-4 * (1 - 0.9 ** 61), 10);
    expect(s.distanceKm).toBeCloseTo(42.195, 10);
  });

  it("starts from the first weigh-in inside the phase when there was none before", () => {
    const series = trendSeries([{ date: "2026-08-05", kg: 80 }]);
    const empty = { intake: [], workouts: 0, prs: 0, distanceM: 0 };
    const s = phaseSummary({ start: "2026-08-01", end: "2026-08-10", series, ...empty });
    expect(s.startTrendKg).toBe(80);
    expect(s.endTrendKg).toBe(80);
    expect(s.avgKcal).toBeNull();
    expect(phaseSummary({ start: "2026-07-01", end: "2026-07-10", series, ...empty }).changeKg).toBeNull();
  });
});
