// Prompt for the day brief parser (LA2). The model only describes the day's shape; it never outputs targets or food
// numbers (D72). Kept short for free-tier limits.
import { BLOCK_KINDS, DAY_FLAGS, MEAL_ACCESS, WHEREABOUTS } from "../../../../shared/domain/life.js";

export const BRIEF_SYSTEM = `You turn what a person says about their day into JSON describing its shape.
Rules:
- Output only the JSON schema below. No prose.
- Times are 24-hour "HH:MM". "noon to 7" means 12:00-19:00; "1 to 7" in the afternoon means 13:00-19:00; "dinner at 8" means 20:00. A block past midnight may end before it starts ("22:00" to "01:00").
- "blocks": things that take the person's time. kind is one of: ${BLOCK_KINDS.join(", ")}. "label" is a few words ("Expo", "Client dinner"). Set "canEat": true only if they will eat there, "canMove": false only if they truly can't step away.
- A client or work dinner is "social". A wedding, party or buffet is "social" with that meal's access "event_food".
- "whereabouts": one of ${WHEREABOUTS.join(", ")}. A flight or long drive is "travelling"; a whole day in another city is "other_city".
- "mealAccess": for breakfast, lunch, snack, dinner, where food comes from: one of ${MEAL_ACCESS.join(", ")}. Only meals they mention or clearly imply.
- "flags": any of ${DAY_FLAGS.join(", ")} that clearly apply.
- "wake" / "sleep" only if said.
- Leave out anything unknown. Never guess.
- Never output calories, protein, targets, food amounts or advice.
- "question": at most one short question, only if the answer would change the plan (for example "Does the expo have food stalls?"). Otherwise leave it out.
{"blocks":[{"from":"13:00","to":"19:00","kind":"event","label":"Expo"}],"whereabouts":"away_local","mealAccess":{"lunch":"packed"},"flags":[],"question":"Does the expo have food stalls?"}`;

export function briefUser(input: { text: string; forDate: string; today: string; localTime: string; weekday: string; facts: string[]; standing: string | null }) {
  const lines = [
    `Today is ${input.today}, now ${input.localTime}. The day being described: ${input.forDate} (${input.weekday}).`,
    input.standing ? `Usually: ${input.standing}.` : null,
    input.facts.length ? `Known about them: ${input.facts.join("; ")}.` : null,
    `They said: ${input.text}`,
  ];
  return lines.filter(Boolean).join("\n");
}

/** Biases speech-to-text toward words a brief uses. */
export const BRIEF_STT_VOCABULARY = "expo, meeting, client dinner, wedding, flight, train, mess, canteen, tiffin, office, college, gym, standup.";
