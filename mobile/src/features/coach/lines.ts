// P35 · The coach's voice outside the chat (D60): Home's coach line (S10) and notification copy (P36), as templates per
// persona so they work offline and cost nothing. Same characters as the chat prompts (backend/src/modules/coach/prompts.ts).
// Never shaming (DESIGN.md §8.1), never below the floor, no swearing. Notifications: title ≤ 40, body ≤ 90 characters,
// number first, action last (§8.3).
import type { CoachId } from "@/core/api/types";
import { formatInt } from "@/features/targets/format";
import type { NudgeKind } from "@shared/domain/nudges";

export type LineSituation =
  | "morning"
  | "on_track"
  | "protein"
  | "under"
  | "over"
  | "over_late"
  | "done"
  | "streak_risk"
  | "welcome_back"
  | "steps";

export type LineFacts = {
  proteinLeftG: number;
  kcalLeft: number;
  overKcal: number;
  /** The walk Move suggests when over (D57); 0 when none. */
  walkMinutes: number;
  walkKcal: number;
  /** Tomorrow's ease when over late (D57). */
  easeKcal: number;
  streak: number;
  targetKcal: number;
  targetProteinG: number;
  stepsLeft: number;
  walkForSteps: number;
};

const n = formatInt;

type Lines = Record<LineSituation, (f: LineFacts) => string>;

const LINES: Record<CoachId, Lines> = {
  drill_sergeant: {
    morning: (f) => `${n(f.targetKcal)} kcal. ${n(f.targetProteinG)} g protein. That's the mission. Log breakfast.`,
    on_track: () => "On track. Hold the line.",
    protein: (f) => `${n(f.proteinLeftG)} g protein below your plan in the records. Want food ideas?`,
    under: (f) => `${n(f.kcalLeft)} kcal and ${n(f.proteinLeftG)} g protein left. Eat a real dinner.`,
    over: () => "Meal recorded. No need to compensate. Continue your usual plan.",
    over_late: () => "Rest tonight. Your usual target stays unchanged.",
    done: () => "Food targets recorded. Done for now.",
    streak_risk: () => "Your earlier work is still here. Start with today when you're ready.",
    welcome_back: () => "You're back. Good. We start again today.",
    steps: (f) => `${n(f.stepsLeft)} steps to go. ${f.walkForSteps} minutes, brisk. Move.`,
  },
  calm_mentor: {
    morning: (f) =>
      `Today's plan: ${n(f.targetKcal)} kcal and ${n(f.targetProteinG)} g protein. A steady breakfast is a good start.`,
    on_track: () => "You're right on track. Nothing to change.",
    protein: (f) => `You're ${n(f.proteinLeftG)} g short on protein. An easy dinner can close most of it.`,
    under: (f) => `${n(f.kcalLeft)} kcal and ${n(f.proteinLeftG)} g protein left. A calm, balanced dinner covers it.`,
    over: () => "One meal doesn't define the week. No need to compensate for it.",
    over_late: () => "Rest tonight. Your usual target stays unchanged.",
    done: () => "Food targets recorded. You're done for now.",
    streak_risk: () => "Your earlier work is still here. Continue whenever you're ready.",
    welcome_back: () => "Welcome back. Nothing to catch up on. Start with today.",
    steps: (f) => `${n(f.stepsLeft)} steps left. A ${f.walkForSteps}-minute walk gets you there.`,
  },
  desi_legend: {
    morning: (f) => `Rise and shine! ${n(f.targetKcal)} kcal, ${n(f.targetProteinG)} g protein today. Chalo, let's go!`,
    on_track: () => "Bilkul on track! Keep this energy going!",
    protein: (f) => `${n(f.proteinLeftG)} g protein baaki hai! Paneer, dal, eggs — chalo, finish strong tonight!`,
    under: (f) => `${n(f.kcalLeft)} kcal and ${n(f.proteinLeftG)} g protein still baaki! A proper dinner, yaar!`,
    over: () => "Meal saved, yaar. No need to earn it back. Carry on with your usual plan.",
    over_late: () => "Rest well, legend. Tomorrow's usual target stays the same.",
    done: () => "Food targets recorded, shabash! Done for now.",
    streak_risk: () => "Your earlier effort is still here, yaar. Start whenever you're ready.",
    welcome_back: () => "Arre, welcome back! Nothing to catch up on. Start with today.",
    steps: (f) => `${n(f.stepsLeft)} steps baaki! ${f.walkForSteps} minutes of brisk walking, chalo!`,
  },
};

export const coachLine = (coach: CoachId, situation: LineSituation, facts: LineFacts) => LINES[coach][situation](facts);

const TITLE: Record<NudgeKind, (f: LineFacts) => string> = {
  morning: () => "Your chosen meal reminder",
  protein: () => "Food ideas when useful",
  workout: () => "Workout time",
  slipping: () => "Your chosen record review",
  streak: () => "Your recording history",
  praise: () => "Food targets recorded",
};

const WORKOUT_BODY: Record<CoachId, string> = {
  drill_sergeant: "No workout logged yet. Gear up. Tap to start.",
  calm_mentor: "A good time for today's session. Tap to start when you're ready.",
  desi_legend: "Gym bulaa raha hai! Tap to start today's workout.",
};

const SITUATION: Record<Exclude<NudgeKind, "workout">, LineSituation> = {
  morning: "morning",
  protein: "protein",
  slipping: "under",
  streak: "streak_risk",
  praise: "done",
};

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

/** Notification copy in the coach's voice: title ≤ 40, body ≤ 90 characters (DESIGN.md §8.3). */
export function nudgeCopy(coach: CoachId, kind: NudgeKind, facts: LineFacts): { title: string; body: string } {
  void SITUATION; void facts;
  const body = kind === "workout" ? WORKOUT_BODY[coach] : kind === "morning" ? "Save something you ate when it suits you. Your records will be here." : "Your records may have changed. Open Zorka if a review would help.";
  return { title: clip(TITLE[kind](facts), 40), body: clip(body, 90) };
}
