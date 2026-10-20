// UX O3: the onboarding steps after Welcome. Diet moved onto Basics, the coach and the water and step goals are
// defaulted and shown on the plan, Health Connect is offered on the plan, and the target step only shows for goals
// with a target weight. 5 steps for "lose fat" / "build muscle", 4 for "maintain" / "get fitter".
import type { Goal } from "@/core/api/types";
import { goalHasPace } from "@shared/domain/targets";

// LA1: "Your life" (meals, budget, a typical day, sessions) comes after activity; every answer there can be skipped.
export type StepId = "goal" | "basics" | "activity" | "life" | "target" | "plan";

const ALL: readonly StepId[] = ["goal", "basics", "activity", "life", "target", "plan"];

export function stepsFor(goal: Goal | null): StepId[] {
  return goal && !goalHasPace(goal) ? ALL.filter((s) => s !== "target") : [...ALL];
}

export const stepHref = (id: StepId) => `/onboarding/${id}` as const;

/** The step after this one for the goal; the plan is last. */
export function nextStep(id: StepId, goal: Goal | null): StepId {
  const steps = stepsFor(goal);
  return steps[Math.min(steps.length - 1, steps.indexOf(id) + 1)] ?? "plan";
}
