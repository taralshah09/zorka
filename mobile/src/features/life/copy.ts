// Copy for the life plan. The planner gives codes and numbers (D72); these templates turn them into sentences. The coach
// persona may rephrase them in chat, but the numbers always come from the plan.
import type { DayType } from "@shared/domain/dayType";
import type { MealAccess, Whereabouts, BlockKind, DayFlag } from "@shared/domain/life";
import type { PlanItem, PlanWhy } from "@shared/domain/planDay";
import type { WeekPlan } from "@shared/domain/week";
import { MEAL_LABEL } from "@/features/food/format";
import { minuteLabel } from "./standing";

export const DAY_TYPE_LABEL: Record<DayType, string> = {
  normal: "Usual day",
  busy: "Busy day",
  away: "Away day",
  travel: "Travel day",
  late_work: "Late work",
  feast: "Event day",
  exam: "Exam day",
  sick: "Sick day",
  rest: "Rest day",
};

export const WHEREABOUTS_LABEL: Record<Whereabouts, string> = {
  home: "Around home",
  away_local: "Out in the city",
  travelling: "Travelling",
  other_city: "Another city",
};

export const ACCESS_LABEL: Record<MealAccess, string> = {
  home: "Home",
  mess: "Mess",
  canteen: "Canteen",
  eat_out: "Eating out",
  packed: "Packed",
  event_food: "Event food",
  unknown: "Not sure",
};

export const BLOCK_LABEL: Record<BlockKind, string> = {
  work: "Work",
  travel: "Travel",
  event: "Event",
  social: "Social",
  study: "Study",
  sleep: "Sleep",
  other: "Busy",
};

export const FLAG_LABEL: Record<DayFlag, string> = {
  sick: "Feeling sick",
  exam: "Exam",
  fasting: "Fasting",
  feast: "Big meal / event",
  rest_day: "Rest day",
  no_gym_access: "No gym",
};

const WHY: Partial<Record<PlanWhy, string>> = {
  assumed_day: "No brief for this day, so this assumes a usual day. Tell me if not.",
  event_allowance: "Event day: a bigger allowance, already made room for this week.",
  event_prebank: "A little lighter to make room for an event later this week.",
  over_spread: "A little lighter: an earlier day went over.",
  under_spread: "A little more: an earlier day came in under.",
  missed_protein_spread: "A bit more protein to make up an earlier day.",
  achievable_protein: "Protein set to what your meals today can realistically give.",
  missed_steps_spread: "A few more steps to make up an earlier day.",
  busy_steps_flex: "Fewer steps today; the rest moves to other days.",
  away_no_steps: "You'll likely walk plenty out there, so no step reminders.",
  travel_no_steps: "No step goal on a travel day.",
  sick_care: "Rest and eat at maintenance. Nothing moves because you're unwell.",
  session_moved: "A workout moved here because another day couldn't hold it.",
  session_planned: "Workout planned.",
  event_food: "Event food: start with the protein, then enjoy it.",
  lunch_walk: "A short walk at lunch instead of the late evening.",
  no_window_for_workout: "No free window long enough for a workout today.",
};

export const whyText = (codes: readonly PlanWhy[]) => codes.map((c) => WHY[c]).filter((t): t is string => !!t);

export function itemTitle(item: PlanItem): string {
  switch (item.kind) {
    case "meal":
      return item.usual ? `${MEAL_LABEL[item.slot]}: ${item.title}` : `${MEAL_LABEL[item.slot]} · ${ACCESS_LABEL[item.access]}`;
    case "workout":
      return `${item.name} · ${item.minutes} min`;
    case "walk":
      return `Walk · ${item.minutes} min`;
    case "water":
    case "prep":
      return item.text;
  }
}

export const itemTime = (item: PlanItem) => (item.kind === "prep" && item.dayOffset === -1 ? `Night before, ${minuteLabel(item.at)}` : minuteLabel(item.at));

/** "Can't fit 400 kcal this week without going too low. Letting it go." and friends. */
export function forgivenLines(week: WeekPlan): string[] {
  const out: string[] = [];
  const f = week.forgiven;
  if (week.why.includes("forgiven_kcal") && f.kcal < 0) out.push(`Can't fit ${Math.abs(f.kcal)} kcal this week without going too low. Letting it go.`);
  if (week.why.includes("forgiven_kcal") && f.kcal > 0) out.push(`${f.kcal} kcal under this week. No need to make it up.`);
  if (f.proteinG > 0) out.push(`${f.proteinG} g protein can't fit this week. That's fine.`);
  if (week.why.includes("forgiven_steps")) out.push(`${f.steps.toLocaleString("en-IN")} steps won't fit this week. Letting them go.`);
  if (f.sessions > 0) {
    const done = week.sessionsDone + (week.days.filter((d) => d.train && !d.past).length);
    out.push(`${week.sessionsTarget} workouts won't fit this week. ${done} is still a good week.`);
  }
  return out;
}

export const weekdayShort = (date: string) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${date}T00:00:00Z`).getUTCDay()]!;
