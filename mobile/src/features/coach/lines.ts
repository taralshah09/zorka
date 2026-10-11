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
    protein: (f) => `${n(f.proteinLeftG)} g protein short. No excuses. Fix it.`,
    under: (f) => `${n(f.kcalLeft)} kcal and ${n(f.proteinLeftG)} g protein left. Eat a real dinner.`,
    over: (f) =>
      f.walkMinutes
        ? `${n(f.overKcal)} over. Walk it off: ${f.walkMinutes} minutes, tonight.`
        : `${n(f.overKcal)} over. Tomorrow we tighten up.`,
    over_late: (f) => `${n(f.overKcal)} over. No midnight runs. Tomorrow's target drops ${n(f.easeKcal)}. Sleep.`,
    done: () => "All targets hit. That's the standard.",
    streak_risk: (f) => `${f.streak}-day streak on the line. One log. Now.`,
    welcome_back: () => "You're back. Good. We start again today.",
    steps: (f) => `${n(f.stepsLeft)} steps to go. ${f.walkForSteps} minutes, brisk. Move.`,
  },
  calm_mentor: {
    morning: (f) =>
      `Today's plan: ${n(f.targetKcal)} kcal and ${n(f.targetProteinG)} g protein. A steady breakfast is a good start.`,
    on_track: () => "You're right on track. Nothing to change.",
    protein: (f) => `You're ${n(f.proteinLeftG)} g short on protein. An easy dinner can close most of it.`,
    under: (f) => `${n(f.kcalLeft)} kcal and ${n(f.proteinLeftG)} g protein left. A calm, balanced dinner covers it.`,
    over: (f) =>
      f.walkMinutes
        ? `One meal doesn't define a phase. A ${f.walkMinutes}-minute walk tonight burns about ${n(f.walkKcal)}.`
        : "One meal doesn't define a phase. Tomorrow is a fresh page.",
    over_late: (f) => `One meal doesn't define a phase. Rest tonight; tomorrow's target eases by ${n(f.easeKcal)}.`,
    done: () => "Everything done today. Well earned.",
    streak_risk: (f) => `Your ${f.streak}-day streak is still yours. One small log keeps it going.`,
    welcome_back: () => "Welcome back. Your trend held steady. Let's pick up from here.",
    steps: (f) => `${n(f.stepsLeft)} steps left. A ${f.walkForSteps}-minute walk gets you there.`,
  },
  desi_legend: {
    morning: (f) => `Rise and shine! ${n(f.targetKcal)} kcal, ${n(f.targetProteinG)} g protein today. Chalo, let's go!`,
    on_track: () => "Bilkul on track! Keep this energy going!",
    protein: (f) => `${n(f.proteinLeftG)} g protein baaki hai! Paneer, dal, eggs — chalo, finish strong tonight!`,
    under: (f) => `${n(f.kcalLeft)} kcal and ${n(f.proteinLeftG)} g protein still baaki! A proper dinner, yaar!`,
    over: (f) =>
      f.walkMinutes
        ? `Shaadi ka khana, no regrets! A ${f.walkMinutes}-minute walk tonight and we're right back on track.`
        : "Big meal, big heart! Tomorrow we come back stronger!",
    over_late: (f) => `No late-night runs, legend! Sleep well; tomorrow's target eases by ${n(f.easeKcal)}.`,
    done: () => "Every target smashed! That's how legends are made!",
    streak_risk: (f) => `${f.streak} days strong! Don't let it slip tonight. One log, bas!`,
    welcome_back: () => "Arre, welcome back! Your trend held steady. Let's roll!",
    steps: (f) => `${n(f.stepsLeft)} steps baaki! ${f.walkForSteps} minutes of brisk walking, chalo!`,
  },
};

export const coachLine = (coach: CoachId, situation: LineSituation, facts: LineFacts) => LINES[coach][situation](facts);

const TITLE: Record<NudgeKind, (f: LineFacts) => string> = {
  morning: (f) => `${n(f.targetKcal)} kcal · ${n(f.targetProteinG)} g protein today`,
  protein: (f) => `${n(f.proteinLeftG)} g protein to go`,
  workout: () => "Workout time",
  slipping: (f) => `${n(f.kcalLeft)} kcal left today`,
  streak: (f) => `${f.streak}-day streak at risk`,
  praise: () => "All goals hit today",
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
  const body = kind === "workout" ? WORKOUT_BODY[coach] : coachLine(coach, SITUATION[kind], facts);
  return { title: clip(TITLE[kind](facts), 40), body: clip(body, 90) };
}
