// AB6 · The personal speech-to-text hint (docs/ASSISTANT_BAR_PLAN.md "Prevent: a personal vocabulary hint"). Whisper
// and Gemini both take a short word list that biases what they hear. Built per turn: the user's learned aliases (what a
// corrected word means), their usual meals, recent foods and saved exercises, then the app's base words. Ranked in that
// order (the phone sends each list newest first) and cut to about 200 tokens, the provider's prompt limit.
import type { AssistantTurnBody } from "./assistant.schemas.js";

/** ~4 characters a token: about 200 tokens. */
export const VOCAB_MAX_CHARS = 800;

/** Words every turn may use: commands, Indian food, gym and day words, and the persona's Hinglish. */
export const BASE_VOCABULARY = [
  "Zorka",
  "roti",
  "phulka",
  "paratha",
  "katori",
  "dal",
  "rajma",
  "chole",
  "poha",
  "upma",
  "idli",
  "dosa",
  "sambar",
  "sabzi",
  "paneer",
  "dahi",
  "chaas",
  "lassi",
  "chai",
  "khichdi",
  "biryani",
  "bench press",
  "squat",
  "deadlift",
  "reps",
  "sets",
  "kilos",
  "walk",
  "run",
  "ride",
  "glasses of water",
  "remind me",
  "undo",
  "nashta",
  "khaya",
  "bimaar",
  "halka",
  "shuru karo",
];

/** Builds the hint: personal words first, base words to fill, no repeats, under VOCAB_MAX_CHARS. */
export function vocabularyHint(vocab: AssistantTurnBody["vocab"]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  let length = 0;
  const add = (word: string) => {
    const w = word.replace(/\s+/g, " ").trim();
    const key = w.toLowerCase();
    if (!w || seen.has(key) || length + w.length + 2 > VOCAB_MAX_CHARS) return;
    seen.add(key);
    out.push(w);
    length += w.length + 2;
  };
  for (const a of vocab?.aliases ?? []) add(a.means);
  for (const u of vocab?.usuals ?? []) add(u);
  for (const r of vocab?.recent ?? []) add(r);
  for (const e of vocab?.exercises ?? []) add(e);
  for (const b of BASE_VOCABULARY) add(b);
  return `${out.join(", ")}.`;
}
