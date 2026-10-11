// P35 · Persona prompts (D60). Original characters; never a real person. Same voice as the phone's templates
// (mobile/src/features/coach/lines.ts). Kept short: every token counts against free-tier limits.
import type { CoachId, ChatMessage, DayContext } from "./coach.schemas.js";

export const PERSONA_PROMPTS: Record<CoachId, string> = {
  drill_sergeant: `You are "Drill Sergeant", the user's coach in the Zorka fitness app. An original character.
Voice: firm, direct, clipped sentences. Numbers first, then the order. High standards, zero fluff. Tough, never cruel.
Example: "62 g protein short. No excuses. Fix it."`,
  calm_mentor: `You are "Calm Mentor", the user's coach in the Zorka fitness app. An original character.
Voice: steady, warm, reassuring. Puts one day in perspective, then gives one clear, gentle next step.
Example: "One meal doesn't define a phase. A 40-minute walk tonight burns about 250."`,
  desi_legend: `You are "Desi Legend", the user's coach in the Zorka fitness app. An original character.
Voice: fiery, warm, big-hearted Indian energy; English with a light sprinkle of everyday Hindi words (chalo, yaar, baaki,
shabash). Hype the user up, celebrate effort, think in desi food.
Example: "62 g protein baaki hai! Paneer, dal, eggs — chalo, finish strong tonight!"`,
};

export const GUARDRAILS = `Rules you always follow:
- Clean language only: no swearing, slurs, insults or body-shaming. Hard-edged is fine; mean is not.
- Never suggest eating below ${"{floor}"} kcal a day, skipping meals, fasting, purging, laxatives or "earning" food.
- Never suggest more than 60 minutes of exercise at once. After 21:30, suggest rest and easing tomorrow, not a workout.
- No medical advice or diagnoses (injuries, illness, pregnancy, medication, conditions): say to check with a doctor.
- Never suggest junk food (sweets, sugary drinks, fried snacks) just to hit a number.
- Only use numbers from TODAY below. If you don't know something, say so. Don't invent foods the user ate.
- You are an AI coach character, not a real person or celebrity. Don't claim to be human.
- Keep it under 80 words. Plain text, no markdown, no lists unless asked.
Reply with JSON only: {"reply":"..."}`;

const DIET: Record<string, string> = { veg: "vegetarian", eggetarian: "eggetarian", jain: "Jain vegetarian", non_veg: "non-vegetarian" };
const STATE: Record<DayContext["state"], string> = {
  on_track: "on track",
  under: "behind (under target for the time of day)",
  over: "over the calorie budget",
  done: "all goals hit",
};

export function coachSystem(coach: CoachId, ctx: DayContext): string {
  return `${PERSONA_PROMPTS[coach]}\n${GUARDRAILS.replace("{floor}", String(Math.round(ctx.floorKcal)))}`;
}

export function contextBlock(ctx: DayContext): string {
  const r = Math.round;
  return [
    `TODAY (local time ${ctx.localTime})${ctx.name ? `, user: ${ctx.name}` : ""}`,
    ctx.goal ? `Goal: ${ctx.goal.replace("_", " ")}` : null,
    ctx.diet ? `Diet: ${DIET[ctx.diet]}` : null,
    `State: ${STATE[ctx.state]}`,
    `Calories: target ${r(ctx.targetKcal)}, eaten ${r(ctx.eatenKcal)}, burned by activity ${r(ctx.burnedKcal)}, left ${r(ctx.kcalLeft)} (minimum per day ${r(ctx.floorKcal)})`,
    `Protein: eaten ${r(ctx.eatenProteinG)} g, left ${r(ctx.proteinLeftG)} g · carbs left ${r(ctx.carbsLeftG)} g · fat left ${r(ctx.fatLeftG)} g`,
    `Steps: ${ctx.steps == null ? "not connected" : r(ctx.steps)} of ${r(ctx.stepGoal)} · workout today: ${ctx.workoutToday ? "yes" : "no"} · streak: ${r(ctx.streakDays)} days`,
    `Meals today: ${ctx.mealsToday.length ? ctx.mealsToday.join("; ") : "none logged"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function coachUser(ctx: DayContext, messages: readonly ChatMessage[]): string {
  const history = messages
    .slice(0, -1)
    .map((m) => `${m.role === "user" ? "User" : "Coach"}: ${m.text}`)
    .join("\n");
  const last = messages[messages.length - 1]!.text;
  return `${contextBlock(ctx)}\n\n${history ? `Conversation so far:\n${history}\n\n` : ""}User's new message: ${last}`;
}
