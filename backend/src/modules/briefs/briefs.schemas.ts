// LA2 · POST /v1/users/:id/brief/parse (docs/LIFE_PLAN.md "Backend", D72–D74): the user's words about a day → DayFacts.
// The AI only turns words into this JSON (times as "HH:MM"); code converts and validates it (validateDayFacts). Nothing
// is saved here: the phone confirms the chips and saves the brief through sync.
import { z } from "zod";

import { BLOCK_KINDS, MEAL_ACCESS, WHEREABOUTS, type DayFacts } from "../../../../shared/domain/life.js";
import { AUDIO_TYPES, MAX_AUDIO_BASE64 } from "../mealParse/parse.schemas.js";
import { BUDGET_BANDS, MEAL_SOURCES, WORK_PATTERNS } from "../users/users.schemas.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const BriefParseBody = z
  .object({
    /** Typed text, or a voice note (one of the two). */
    text: z.string().trim().min(1).max(1000).optional(),
    audioBase64: z.string().min(100).max(MAX_AUDIO_BASE64).optional(),
    mimeType: z.enum(AUDIO_TYPES).optional(),
    /** The day the brief describes, and the user's today and local time (for "tomorrow", "Saturday"). */
    forDate: date,
    today: date,
    localTime: z.string().regex(/^\d{2}:\d{2}$/),
    standing: z
      .object({
        mealSource: z.enum(MEAL_SOURCES).nullable(),
        budget: z.enum(BUDGET_BANDS).nullable(),
        workPattern: z.enum(WORK_PATTERNS).nullable(),
      })
      .partial()
      .strict()
      .optional(),
    /** Up to 8 active fact texts ("Lunch is usually at the mess"). */
    recentFacts: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
  })
  .strict()
  .refine((b) => !!b.text !== !!b.audioBase64, "send text or audioBase64, not both")
  .refine((b) => !b.audioBase64 || !!b.mimeType, "mimeType is required with audioBase64");
export type BriefParseBody = z.infer<typeof BriefParseBody>;

const hhmm = z.string().regex(/^\d{1,2}:\d{2}$/);
const loose = <T extends z.ZodType>(s: T) => s.optional().catch(undefined);

/** What we ask the model for. Lenient: a bad field is dropped, never fails the brief. */
export const AiBrief = z.object({
  blocks: z
    .array(
      z.object({
        from: hhmm,
        to: hhmm,
        kind: z.enum(BLOCK_KINDS).catch("other"),
        label: loose(z.string().trim().max(60)),
        canEat: loose(z.boolean()),
        canMove: loose(z.boolean()),
      }),
    )
    .max(12)
    .catch([]),
  whereabouts: loose(z.enum(WHEREABOUTS)),
  mealAccess: loose(z.record(z.string(), z.enum(MEAL_ACCESS).catch("unknown"))),
  wake: loose(hhmm),
  sleep: loose(hhmm),
  flags: loose(z.array(z.string())),
  question: loose(z.string().trim().min(3).max(140)),
});
export type AiBrief = z.infer<typeof AiBrief>;

export type BriefParseResult = {
  transcript: string | null;
  facts: DayFacts;
  /** At most one clarifying question ("Does the expo have food stalls?"). */
  question: string | null;
  ai: { slot: string; model: string; attempts: number };
};

