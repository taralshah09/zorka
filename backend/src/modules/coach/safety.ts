// P35 · Guardrails enforced in code, not just in the prompt (D60).
//   1. The user's message: signs of self-harm or disordered eating get a fixed supportive reply. The AI isn't called.
//   2. The AI's reply: swearing or unsafe advice is replaced with a safe line; long replies are trimmed to ~80 words.
//   3. UX N1 · The AI's buttons: each one is checked on its own (checkActions); a bad one is dropped.
import { CoachAction, MAX_ACTIONS, type CoachId } from "./coach.schemas.js";

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
  drill_sergeant: "Your records are on Home. They may be incomplete. Choose what helps you today.",
  calm_mentor: "Your records are on Home. They may be incomplete. Continue whenever you're ready.",
  desi_legend: "Chalo, start with today! Your earlier effort is still here. Pick what helps, yaar.",
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

/** UX N1 · The button under a fallback reply, which points the user at today's numbers. */
export const FALLBACK_ACTIONS: CoachAction[] = [{ type: "open", label: "See today's numbers", screen: "day" }];

/** Same rule as the prompt: after 21:30 the coach suggests rest, not a workout (D57). */
const LATE_NIGHT = "21:30";

/**
 * UX N1 · The buttons to send: each one well-formed, clean, not a workout late at night, no duplicates, at most
 * MAX_ACTIONS. Anything else is dropped quietly; the reply still goes out.
 */
export function checkActions(raw: readonly unknown[] | undefined, localTime: string): CoachAction[] {
  const out: CoachAction[] = [];
  const seen = new Set<string>();
  for (const item of raw ?? []) {
    const parsed = CoachAction.safeParse(item);
    if (!parsed.success) continue;
    const a = parsed.data;
    const words = "text" in a ? `${a.label} ${a.text}` : a.label;
    if (PROFANITY.test(words) || UNSAFE_ADVICE.test(words)) continue;
    if (localTime >= LATE_NIGHT && (a.type === "start_workout" || (a.type === "open" && a.screen === "record_walk")))
      continue;
    const key = a.type === "open" ? `open:${a.screen}` : a.type;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
    if (out.length === MAX_ACTIONS) break;
  }
  return out;
}

/** The reply to send, or null when it must be replaced by FALLBACK_REPLY. */
export function checkReply(text: string): string | null {
  if (PROFANITY.test(text) || UNSAFE_ADVICE.test(text) || /\b(no excuses|walk it off|burn (it|the meal) off|earn (your |the )?food|compensate|target (drops|eases)|water,? not fat)\b/i.test(text)) return null;
  const trimmed = trimReply(text.replace(/[*_#`]/g, ""));
  return trimmed || null;
}
