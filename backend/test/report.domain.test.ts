// D87 · The weekly report card (shared/domain/report.ts).
import { describe, expect, it } from "vitest";

import { gradeFor, weekReport, type ReportDay } from "../../shared/domain/report.js";

const WEEK = ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"]; // Sun–Sat
const day = (date: string, over: Partial<ReportDay> = {}): ReportDay => ({
  date,
  dayType: null,
  logged: true,
  kcal: 2750,
  proteinG: 135,
  steps: 10000,
  trained: false,
  target: { kcal: 2750, proteinG: 135, steps: 10000, train: false },
  hit: { calories: true, protein: true, steps: true },
  ...over,
});
const report = (days: ReportDay[], sessions = 3) => weekReport(days, WEEK[0]!, WEEK[6]!, sessions);

describe("weekReport", () => {
  it("a week that hits everything is an A: averages, every area graded, nothing to work on", () => {
    const r = report(WEEK.map((d, i) => day(d, { trained: i % 2 === 1, target: { kcal: 2750, proteinG: 135, steps: 10000, train: i % 2 === 1 } })));
    expect(r).toMatchObject({ grade: "A", score: 100, daysLogged: 7, sickDays: 0 });
    expect(r.kcal).toEqual({ avg: 2750, target: 2750, onTargetDays: 7, grade: "A" });
    expect(r.protein).toMatchObject({ avg: 135, hitDays: 7, grade: "A" });
    expect(r.steps).toMatchObject({ avg: 10000, target: 10000, hitDays: 7, days: 7, grade: "A" });
    expect(r.workouts).toEqual({ done: 3, planned: 3, missed: [], grade: "A" });
    expect(r.toWorkOn).toEqual([]);
    expect(r.focus).toBeNull();
    expect(r.wentWell).toHaveLength(4);
  });

  it("Kabir's week: short on protein, over on Saturday, a missed Tuesday workout; the weakest area sets the focus", () => {
    const r = report(
      WEEK.map((d, i) =>
        day(d, {
          proteinG: i < 4 ? 90 : 135,
          kcal: i >= 5 ? 3400 : 2750,
          steps: 7000,
          trained: d === WEEK[4],
          target: { kcal: 2750, proteinG: 135, steps: 10000, train: d === WEEK[2] || d === WEEK[4] },
          hit: { calories: i < 5, protein: i >= 4, steps: false },
        }),
      ),
    );
    expect(r.protein.avg).toBe(Math.round((90 * 4 + 135 * 3) / 7));
    expect(r.workouts).toMatchObject({ done: 1, planned: 3, missed: [WEEK[2]] });
    expect(r.toWorkOn).toEqual(
      expect.arrayContaining([
        "Protein averaged 109 g of 135 g. Short on Sun, Mon, Tue and Wed.",
        "Calories went over on Fri and Sat, by about 650 kcal on those days.",
        "1 of 3 workouts done; missed Tue.",
        "Steps averaged 7,000 of 10,000 a day.",
      ]),
    );
    expect(r.focus).toMatch(/^Next week: /);
    expect(["C", "D"]).toContain(r.grade);
  });

  it("a sick day counts against its own lower target and is named kindly", () => {
    const r = report(WEEK.map((d) => day(d, d === WEEK[3] ? { dayType: "sick", proteinG: 81, steps: null, target: { kcal: 2750, proteinG: 81, steps: null, train: false } } : {})));
    expect(r.sickDays).toBe(1);
    expect(r.protein.hitDays).toBe(7);
    expect(r.steps.days).toBe(6);
    expect(r.wentWell.some((l) => l.startsWith("You were unwell on Wed."))).toBe(true);
  });

  it("few logged days: food has no grade without logs, and logging is what to work on", () => {
    const r = report(WEEK.map((d, i) => day(d, i < 2 ? {} : { logged: false, kcal: 0, proteinG: 0 })), 0);
    expect(r.daysLogged).toBe(2);
    expect(r.workouts).toMatchObject({ planned: 0, grade: null });
    expect(r.toWorkOn[0]).toBe("2 of 7 days fully logged, so the food numbers are rough.");
    expect(r.focus).toMatch(/log every meal/);
    const none = report(WEEK.map((d) => day(d, { logged: false, kcal: 0, proteinG: 0, steps: null })), 0);
    expect(none.kcal).toMatchObject({ avg: null, grade: null });
    expect(none.protein).toMatchObject({ avg: null, grade: null });
    expect(none.steps).toMatchObject({ avg: null, target: null, grade: null });
    expect(none.grade).toBe("D");
  });

  it("days outside the week are ignored; at most four lines each", () => {
    const r = report([day("2026-10-10", { kcal: 9000 }), ...WEEK.map((d) => day(d)), day("2026-10-18", { kcal: 9000 })]);
    expect(r.kcal.avg).toBe(2750);
    expect(r.wentWell.length).toBeLessThanOrEqual(4);
  });

  it("grades: A ≥ 85, B ≥ 70, C ≥ 50, else D", () => {
    expect([100, 85, 84, 70, 69, 50, 49, 0].map(gradeFor)).toEqual(["A", "A", "B", "B", "C", "C", "D", "D"]);
  });
});
