// P30 streak service (shared/domain/streak.ts).
import { describe, expect, it } from "vitest";

import { datesBetween } from "../../shared/domain/progress.js";
import { computeStreak, MAX_FREEZES } from "../../shared/domain/streak.js";

const TODAY = "2026-10-11";

describe("streak", () => {
  it("is empty with no logs, holding the starting freeze", () => {
    expect(computeStreak([], TODAY, 12)).toMatchObject({
      current: 0,
      best: 0,
      freezes: 1,
      todayLogged: false,
      atRisk: false,
      days: [],
    });
  });

  it("counts consecutive logged days including today", () => {
    const s = computeStreak(["2026-10-09", "2026-10-10", "2026-10-11"], TODAY, 9);
    expect(s).toMatchObject({ current: 3, best: 3, todayLogged: true, nextMilestone: 7 });
  });

  it("keeps the streak alive until today ends, and flags it at risk from 8 PM", () => {
    const logs = ["2026-10-09", "2026-10-10"];
    expect(computeStreak(logs, TODAY, 19)).toMatchObject({ current: 2, atRisk: false });
    expect(computeStreak(logs, TODAY, 20)).toMatchObject({ current: 2, atRisk: true });
    expect(computeStreak([], TODAY, 23).atRisk).toBe(false);
  });

  it("uses a freeze for one missed day", () => {
    const s = computeStreak(["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-11"], TODAY, 9);
    expect(s.current).toBe(4);
    expect(s.freezes).toBe(0);
    expect(s.days.find((d) => d.date === "2026-10-10")?.state).toBe("frozen");
  });

  it("resets when a day is missed with no freeze left", () => {
    const s = computeStreak(["2026-10-06", "2026-10-07", "2026-10-11"], TODAY, 9);
    // 08 frozen, 09 missed → reset, 10 missed, 11 logged
    expect(s.days.map((d) => d.state)).toEqual(["logged", "logged", "frozen", "missed", "missed", "logged"]);
    expect(s.current).toBe(1);
    expect(s.best).toBe(2);
  });

  it("earns a freeze every 7 logged days, holding at most 2", () => {
    expect(computeStreak(datesBetween("2026-10-05", TODAY), TODAY, 9)).toMatchObject({ current: 7, freezes: 2 });
    expect(computeStreak(datesBetween("2026-09-20", TODAY), TODAY, 9).freezes).toBe(MAX_FREEZES);
  });

  it("covers two missed days with two freezes", () => {
    const logs = [...datesBetween("2026-09-28", "2026-10-04"), "2026-10-07"];
    const s = computeStreak(logs, "2026-10-07", 9);
    expect(s.current).toBe(8);
    expect(s.freezes).toBe(0);
    expect(s.days.filter((d) => d.state === "frozen")).toHaveLength(2);
  });

  it("reports milestones and the next one", () => {
    expect(computeStreak(datesBetween("2026-10-05", TODAY), TODAY, 9)).toMatchObject({
      milestoneToday: 7,
      nextMilestone: 30,
    });
    expect(computeStreak(datesBetween("2026-10-05", "2026-10-10"), TODAY, 9)).toMatchObject({
      milestoneToday: null,
      current: 6,
    });
    expect(computeStreak(datesBetween("2026-07-01", TODAY), TODAY, 9).nextMilestone).toBe(null);
  });

  it("ignores duplicate and future dates", () => {
    const s = computeStreak(["2026-10-11", "2026-10-11", "2026-10-12"], TODAY, 9);
    expect(s.current).toBe(1);
    expect(s.days).toHaveLength(1);
  });
});
