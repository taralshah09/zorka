// LA6 · What the coach gets about the life plan (DayContext extras): today's date and day type, up to 6 plan items, up
// to 4 week lines, and up to 8 active facts. Numbers come from the plan; the coach explains them (D72).
import type { CoachDayContext } from "@/core/api/types";
import type { DayPlan } from "@shared/domain/planDay";
import { adjustLines, forgivenLines, itemTime, itemTitle, weekdayShort } from "./copy";

export function lifeContext(plan: DayPlan | null, facts: readonly string[], today: string): Partial<CoachDayContext> {
  const out: Partial<CoachDayContext> = { today, facts: facts.slice(0, 8).map((f) => f.slice(0, 200)) };
  if (!plan) return out;
  out.dayType = plan.dayType;
  out.planSummary = [
    `${plan.assumed ? "Assumed usual day. " : ""}Target ${plan.targets.kcalRange ? `${plan.targets.kcalRange[0]}-${plan.targets.kcalRange[1]}` : plan.targets.kcal} kcal, ${plan.targets.proteinG} g protein`,
    ...plan.items.slice(0, 5).map((i) => `${itemTime(i)} ${itemTitle(i)}`),
  ].map((s) => s.slice(0, 120));
  const event = plan.week.days.find((d) => !d.past && d.why.includes("event_allowance"));
  const todayRow = plan.week.days.find((d) => d.date === plan.date);
  out.weekSummary = [
    // What moved today and why: the coach explains these, it never changes them (D72).
    ...(todayRow ? adjustLines(todayRow, today) : []),
    `${plan.week.sessionsDone} of ${plan.week.sessionsTarget} workouts done`,
    event ? `${weekdayShort(event.date)} is an event day (pre-banked)` : null,
    ...forgivenLines(plan.week),
  ]
    .filter((s): s is string => !!s)
    .slice(0, 4)
    .map((s) => s.slice(0, 120));
  return out;
}
