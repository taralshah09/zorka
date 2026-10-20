// AB5 · Facts for the Assistant Bar's questions: numbers come from code, never from the AI (D90). Also the D97 alias
// facts that feed speech-to-text and matching.
import { describe, expect, it } from "vitest";

import { numbersGrounded } from "../../shared/domain/assistant.js";
import { adviceGrounds, answerFacts, answerText, foodFitFacts, onTarget, type AssistantFactsInput, type FitFood } from "../../shared/domain/assistantFacts.js";
import { activeFacts, aliasesFrom, aliasFact, type MemoryFact } from "../../shared/domain/memory.js";

const day = (date: string, kcal: number | null, proteinG: number | null, trained = false) => ({
  date,
  kcal,
  proteinG,
  targetKcal: 1800,
  targetProteinG: 110,
  trained,
});

const INPUT: AssistantFactsInput = {
  today: "2026-10-22",
  day: {
    targetKcal: 1612,
    eatenKcal: 900,
    targetProteinG: 110,
    eatenProteinG: 48,
    steps: 4200,
    stepGoal: 8000,
    glasses: 3,
    waterGoal: 8,
    workoutToday: false,
    mealsLogged: 2,
    coverage: "complete",
  },
  streak: { current: 12, best: 30, atRisk: false },
  week: {
    days: [
      day("2026-10-19", 1790, 72),
      day("2026-10-20", 1810, 70, true),
      day("2026-10-21", 1500, 74),
      day("2026-10-22", 900, 48),
      day("2026-10-23", null, null),
    ],
    sessionsDone: 1,
    sessionsTarget: 3,
  },
  trend: { trendKg: 71.42, weeklyChangeKg: -0.34, weighIns: 9 },
  plan: {
    dayType: "sick",
    kcal: 1600,
    proteinG: 60,
    steps: null,
    items: ["8:30am Breakfast: poha", "1:30pm Lunch: dal + 2 roti"],
    why: ["Lighter today because you're unwell."],
  },
  eat: [{ name: "Paneer bhurji", kcal: 320, proteinG: 22 }],
};

describe("answerFacts", () => {
  it("answers today with numbers from the day", () => {
    const a = answerFacts("today", INPUT);
    expect(a.known).toBe(true);
    expect(answerText(a)).toBe(
      "You've had 900 of 1,612 kcal and 48 of 110 g protein today. That leaves 712 kcal and 62 g protein. 4,200 of 8,000 steps.",
    );
    expect(a.card).toEqual({ kind: "today_rings", kcal: [900, 1612], proteinG: [48, 110], steps: [4200, 8000] });
    expect(numbersGrounded(answerText(a), a.numbers)).toBe(true);
  });

  it("answers another day of the week (and yesterday?)", () => {
    const a = answerFacts("today", INPUT, "2026-10-21");
    expect(a.lines[0]).toBe("Wednesday: 1,500 of 1,800 kcal and 74 of 110 g protein.");
    expect(a.lines[1]).toBe("That day was off target.");
    expect(answerFacts("today", INPUT, "2026-10-23").known).toBe(false);
  });

  it("answers the week: days on target and the weak spot", () => {
    const a = answerFacts("week", INPUT);
    expect(a.lines).toEqual(["0 of 3 days on target so far.", "Protein's been your weak spot (avg 72 of 110 g).", "1 of 3 workouts done."]);
    expect(numbersGrounded(answerText(a), a.numbers)).toBe(true);
    expect(a.card?.kind).toBe("week_bars");
  });

  it("says when it doesn't know", () => {
    expect(answerFacts("trend", { ...INPUT, trend: { trendKg: 70, weeklyChangeKg: null, weighIns: 1 } }).known).toBe(false);
    expect(answerFacts("plan", { ...INPUT, plan: null }).lines).toEqual(["There's no plan for today yet."]);
    expect(answerFacts("week", { ...INPUT, week: null }).known).toBe(false);
  });

  it("answers trend, streak, plan, why and what to eat", () => {
    expect(answerText(answerFacts("trend", INPUT))).toBe("Your trend weight is 71.4 kg. It's down 0.3 kg this week.");
    expect(answerText(answerFacts("streak", INPUT))).toBe("You're on a 12-day streak (best 30).");
    expect(answerFacts("plan", INPUT).lines[0]).toBe("Today is a lighter, sick day: 1,600 kcal and 60 g protein.");
    expect(answerFacts("why", INPUT).lines[1]).toBe("Lighter today because you're unwell.");
    expect(answerText(answerFacts("what_to_eat", INPUT))).toBe(
      "You have 712 kcal and 62 g protein left. Good fits: Paneer bhurji (320 kcal, 22 g protein).",
    );
  });

  it("grounds every template answer in its own numbers", () => {
    for (const topic of ["today", "week", "trend", "streak", "plan", "why", "what_to_eat"] as const) {
      const a = answerFacts(topic, INPUT);
      expect(numbersGrounded(answerText(a), a.numbers), topic).toBe(true);
    }
  });

  it("counts a day on target within 10% kcal and 90% protein", () => {
    expect(onTarget(day("x", 1800, 100))).toBe(true);
    expect(onTarget(day("x", 2100, 110))).toBe(false);
    expect(onTarget(day("x", 1800, 90))).toBe(false);
    expect(onTarget(day("x", null, 100))).toBeNull();
  });
});

describe("alias facts (D97)", () => {
  const fact = (over: Partial<MemoryFact>): MemoryFact => ({
    id: "1",
    evidence: null,
    validFrom: null,
    validUntil: null,
    ...aliasFact({ heard: "dahl", means: "Dal tadka", target: "food", id: "f1" }),
    ...over,
  });

  it("builds one fact per spoken form", () => {
    const f = aliasFact({ heard: " Dahl ", means: "Dal tadka", target: "food", id: "f1" });
    expect(f.key).toBe("alias:dahl");
    expect(f.status).toBe("active");
    expect(f.text).toBe('When you say "Dahl" you mean Dal tadka.');
  });

  it("lists active aliases, newest first, and keeps them out of the coach's facts", () => {
    const facts = [
      fact({ id: "1" }),
      fact({ id: "2", key: "alias:panir", value: { heard: "panir", means: "Paneer" } }),
      fact({ id: "3", status: "dismissed" }),
    ];
    expect(aliasesFrom(facts)).toEqual([
      { heard: "panir", means: "Paneer" },
      { heard: "dahl", means: "Dal tadka" },
    ]);
    expect(activeFacts(facts, "2026-10-20").texts).toEqual([]);
  });
});

describe("food_fit and advice", () => {
  const dalRice: FitFood[] = [
    { heard: "dal", name: "Dal tadka", amount: "1 katori", kcal: 180, proteinG: 9 },
    { heard: "rice", name: "Steamed rice", amount: "1 katori", kcal: 200, proteinG: 4 },
  ];

  it("weighs a named food against what's left today", () => {
    // 1612 - 900: 712 kcal left; 110 - 48: 62 g protein to go.
    const f = foodFitFacts(INPUT, "dal and rice", dalRice);
    expect(f.known).toBe(true);
    expect(f.lines[0]).toBe("dal tadka (1 katori) and steamed rice (1 katori) comes to about 380 kcal and 13 g protein.");
    expect(f.lines[1]).toBe("It fits: you have 712 kcal left, and it leaves 332.");
    expect(f.lines[2]).toContain("light on protein for the 62 g");
    expect(numbersGrounded(answerText(f), f.numbers)).toBe(true);
  });

  it("says how far over a food would go, and never asks to make up for it", () => {
    const full = { ...INPUT, day: { ...INPUT.day, eatenKcal: 1500 } };
    const f = foodFitFacts(full, "dal and rice", dalRice);
    expect(f.lines[1]).toBe("That's 268 kcal more than the 112 you have left, so a smaller portion fits better.");
    const over = foodFitFacts({ ...INPUT, day: { ...INPUT.day, eatenKcal: 1700 } }, "dal and rice", dalRice);
    expect(over.lines[1]).toContain("468 kcal over");
  });

  it("needs a found food, and the server", () => {
    expect(foodFitFacts(INPUT, "xyz", [{ heard: "xyz", name: null, amount: null, kcal: 0, proteinG: 0 }]).known).toBe(false);
    expect(answerFacts("food_fit", INPUT, undefined, "lunch", "dal").known).toBe(false);
    expect(answerFacts("advice", INPUT).known).toBe(false);
  });

  it("grounds advice in today's numbers and this week's training", () => {
    const g = adviceGrounds(INPUT);
    expect(g.lines.join(" ")).toContain("No workout logged today.");
    expect(g.lines.join(" ")).toContain("trained Tuesday");
    expect(g.numbers).toContain(712);
  });
});
