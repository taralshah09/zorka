// UX N2 · Suggested replies in the Coach tab, picked from the same situation Home's brief talks about, so the first
// chip is usually the question the user has right now. A chip's label is short; what it sends can carry the facts the
// coach needs (the server only sees today's numbers, not the check-in).
import type { LineSituation } from "./lines";

export type Suggestion = { label: string; text: string };

const ask = (label: string): Suggestion => ({ label, text: label });

const BY_SITUATION: Record<LineSituation, Suggestion> = {
  morning: ask("What's a good breakfast?"),
  welcome_back: ask("How do I get back on track?"),
  on_track: ask("How am I doing today?"),
  protein: ask("How do I get more protein?"),
  under: ask("What should I eat?"),
  over: ask("I went over. What now?"),
  over_late: ask("I went over. What now?"),
  done: ask("What should I do tomorrow?"),
  streak_risk: ask("Quickest way to keep my streak?"),
  steps: ask("How do I get my steps in?"),
};

const DEFAULTS = [ask("What should I eat?"), ask("Plan tomorrow"), ask("How am I doing today?")];

export const MAX_SUGGESTIONS = 3;

/**
 * Up to three chips: "about this" (from Home's brief) first, then this week's check-in when it's waiting, then the
 * situation's own question, then the usual ones.
 */
export function suggestionsFor(input: {
  situation: LineSituation;
  /** The brief line the user tapped "Ask about this" on. */
  about?: string | null;
  /** This week's check-in as words ("Adjusting your plan. Trend down 0.2 kg…"), when it's waiting. */
  checkin?: string | null;
}): Suggestion[] {
  const list: Suggestion[] = [];
  if (input.about) list.push({ label: "Ask about this", text: `You said: "${input.about}" What should I do?` });
  if (input.checkin) list.push({ label: "Explain my check-in", text: `Explain my weekly check-in: ${input.checkin}` });
  list.push(BY_SITUATION[input.situation], ...DEFAULTS);
  const seen = new Set<string>();
  return list.filter((s) => !seen.has(s.label) && !!seen.add(s.label)).slice(0, MAX_SUGGESTIONS);
}
