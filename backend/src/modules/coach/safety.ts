// P35 · Guardrails enforced in code, not just in the prompt (D60).
//   1. The user's message: signs of self-harm or disordered eating get a fixed supportive reply. The AI isn't called.
//   2. The AI's reply: swearing or unsafe advice is replaced with a safe line; long replies are trimmed to ~80 words.
import type { CoachId } from "./coach.schemas.js";

const SUPPORT_SIGNALS = [
  /\b(kill|hurt|harm)\s+myself\b/i,
  /\bsuicid/i,
  /\b(end|take)\s+my\s+(own\s+)?life\b/i,
  /\bwant\s+to\s+die\b/i,
  /\bself[-\s]?harm/i,
  /\b(make|made)\s+myself\s+(throw\s+up|vomit|sick)\b/i,
  /\bthrow(ing)?\s+up\s+after\s+(eating|meals?)\b/i,
  /\bpurg(e|ing)\b/i,
  /\blaxatives?\b/i,
  /\b(starve|starving)\s+myself\b/i,
  /\b(not|stop)\s+eat(ing)?\s+(at\s+all|for\s+(\d+|a few|several)\s+days)\b/i,
  /\b(anorexi|bulimi|binge[-\s]?purge)/i,
];

/** One calm reply for every persona: safety overrides the character's voice. */
export const SUPPORT_REPLY =
  "I'm really glad you told me. This matters more than any target. Please talk to someone you trust, or a doctor or " +
  "counsellor, today. In India you can call Tele-MANAS at 14416 any time, free. Your targets can wait; you come first.";

export const needsSupport = (text: string) => SUPPORT_SIGNALS.some((re) => re.test(text));

const PROFANITY =
  /\b(f+u+c+k\w*|sh[i1]t\w*|bitch\w*|bastard\w*|asshole\w*|dick(head)?s?|crap|damn\w*|bloody|wtf|stfu|chutiya\w*|bhenchod\w*|madarchod\w*|bc|mc|saala|kamina\w*|gaand\w*|harami\w*)\b/i;
const UNSAFE_ADVICE =
  /\b(skip (a |your |the )?(meal|breakfast|lunch|dinner)s?|don'?t eat (anything|at all|for)|fast(ing)? (for|until)|purg(e|ing)|laxatives?|make yourself (sick|vomit)|starve|(6[1-9]|[7-9]\d|[1-9]\d{2,})[\s-]*(minutes?|mins?)|([2-9]|1\.\d+)\s*(hours?|hrs?) (of )?(running|walking|cardio|exercise|workout|training))\b/i;

/** A safe line in the persona's voice, used when the AI's reply fails the filter. */
export const FALLBACK_REPLY: Record<CoachId, string> = {
  drill_sergeant: "Let's keep it simple. Check today's numbers on Home and close the biggest gap first.",
  calm_mentor: "Let's take this one step at a time. Your numbers for today are on Home; start with the biggest gap.",
  desi_legend: "Chalo, one step at a time! Today's numbers are on Home. Pick the biggest gap and smash it!",
};

export const MAX_REPLY_WORDS = 80;

/** Cuts a reply to MAX_REPLY_WORDS, ending on a full sentence where one exists. */
export function trimReply(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const words = flat.split(" ");
  if (words.length <= MAX_REPLY_WORDS) return flat;
  const cut = words.slice(0, MAX_REPLY_WORDS).join(" ");
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > cut.length / 2 ? cut.slice(0, end + 1) : `${cut}…`;
}

/** The reply to send, or null when it must be replaced by FALLBACK_REPLY. */
export function checkReply(text: string): string | null {
  if (PROFANITY.test(text) || UNSAFE_ADVICE.test(text)) return null;
  const trimmed = trimReply(text.replace(/[*_#`]/g, ""));
  return trimmed || null;
}
