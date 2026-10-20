// D85 · Prompt for the week planner. The model decides the remaining days; code still clamps every number afterwards, so
// the rules here describe the same limits to keep it from wasting its answer. Kept short for free-tier limits.
import type { PlanWeekBody } from "./aiPlan.schemas.js";

export const PLAN_WEEK_SYSTEM = `You are the planner in the Zorka fitness app. You set the user's targets for each remaining day of this week
(today onward) so the plan fits their life and the week's average stays on track.
Decide per day: kcal, proteinG (grams), steps, train (true/false for their workout), and a one-sentence reason in plain
words the user will read ("Since Tuesday came in short on protein, today is a little higher to keep your week's average.").
Rules (the app enforces these; stay inside them):
- Keep the week's total kcal close to the sum of each day's base (within about 3%). Days already logged count as logged.
- Each day: kcal within base ±200 (at most +150 when the goal is lose_fat) and never below the floor. An event day may go
  up to base +800, with other days a little lighter to make room. A sick day stays at or above base, no deficit.
- Protein: at least what the day's meals can realistically reach (or base if lower), at most +20% over that. Spread a past
  shortfall, or protein a day can't reach, over the days that can take more. A sick day's protein is its gentle minimum
  (60% of base, the code plan's number): the rest of a sick day's protein is let go, never moved to other days.
- Steps: between half of base and base +3,000. No step goal (null) on travel or sick days. Fewer steps on busy, late or
  away days; make it up on easier days.
- Workouts: only on days where canTrain is true; aim for sessionsTarget in the week counting sessions already done; never
  3 days in a row. If a usual workout day can't hold one, move it to the nearest day that can.
- Never suggest skipping meals, fasting, "earning" food, or exercise to make up for eating.
- Use only the numbers given. Unlogged past days count as on target.
Reply with JSON only: {"days":[{"date":"YYYY-MM-DD","kcal":2000,"proteinG":130,"steps":8000,"train":false,"reason":"..."}],"summary":"one sentence about the week"}`;

export function planWeekUser(b: PlanWeekBody): string {
  const lines = [
    `Today: ${b.today}. Focus: ${b.focusDate}. Goal: ${b.goal ?? "not set"}. Floor: ${Math.round(b.floorKcal)} kcal/day. Sessions this week: ${b.sessionsTarget}.`,
    b.standing.mealSource || b.standing.budget || b.standing.workPattern
      ? `Life: meals from ${b.standing.mealSource ?? "?"}, budget ${b.standing.budget ?? "?"}, ${b.standing.workPattern ?? "?"}.`
      : null,
    b.facts.length ? `Known: ${b.facts.join("; ")}.` : null,
    "Days (base = usual target; code = the rules plan, for reference):",
    ...b.days.map((d) => {
      const past = d.date < b.today;
      const a = d.actual;
      return [
        `${d.date} ${past ? "PAST" : d.date === b.today ? "TODAY" : "next"} ${d.dayType.replace("_", " ")}`,
        `base ${Math.round(d.base.kcal)} kcal/${Math.round(d.base.proteinG)} g/${Math.round(d.base.steps)} steps`,
        past
          ? a
            ? `logged ${a.kcal ?? "?"} kcal/${a.proteinG ?? "?"} g/${a.steps ?? "?"} steps${a.trained ? ", trained" : ""}`
            : "not logged (counts as on target)"
          : `realistic protein ${d.achievableProteinG ?? "base"} g, canTrain ${d.canTrain}, code ${Math.round(d.code.kcal)}/${Math.round(d.code.proteinG)}/${d.code.steps ?? "none"}${d.code.train ? "/train" : ""}`,
        d.brief ? `brief: "${d.brief}"` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    }),
    "Plan every day from today to the last date above.",
  ];
  return lines.filter(Boolean).join("\n");
}
