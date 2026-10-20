// LA2 · Brief parsing (D72–D74): text (or a voice note → speech-to-text) → the AI's day shape → code turns "HH:MM" into
// minutes and runs validateDayFacts. Saves nothing: the phone shows the chips, the user confirms, and the brief syncs.
import { DAY_FLAGS, validateDayFacts, type DayFacts } from "../../../../shared/domain/life.js";
import { notFound } from "../../http/errors.js";
import type { AiClient } from "../ai/ai.client.js";
import { AiBrief, type BriefParseBody, type BriefParseResult } from "./briefs.schemas.js";
import { BRIEF_STT_VOCABULARY, BRIEF_SYSTEM, briefUser } from "./prompts.js";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h! * 60 + m!;
};

/** The model's "HH:MM" shape → DayFacts, then the same validation the phone and the sync handler use. */
export function toDayFacts(ai: AiBrief): DayFacts {
  return validateDayFacts({
    blocks: ai.blocks.map((b) => ({ ...b, from: minutes(b.from), to: minutes(b.to) })),
    whereabouts: ai.whereabouts,
    mealAccess: ai.mealAccess,
    wakeMinute: ai.wake ? minutes(ai.wake) : undefined,
    sleepMinute: ai.sleep ? minutes(ai.sleep) : undefined,
    flags: (ai.flags ?? []).filter((f) => (DAY_FLAGS as readonly string[]).includes(f)),
  });
}

export function briefsService(ai: AiClient, userExists: (id: string) => Promise<boolean>) {
  return {
    async parse(userId: string, body: BriefParseBody): Promise<BriefParseResult> {
      if (!(await userExists(userId))) throw notFound("User");
      let text = body.text ?? "";
      let transcript: string | null = null;
      if (body.audioBase64) {
        const heard = await ai.transcribe({ base64: body.audioBase64, mimeType: body.mimeType! }, BRIEF_STT_VOCABULARY);
        transcript = heard.text.trim();
        text = transcript;
      }
      if (!text.replace(/[^a-z0-9]/gi, "")) {
        return { transcript, facts: validateDayFacts({}), question: null, ai: { slot: "none", model: "none", attempts: 0 } };
      }
      const weekday = WEEKDAYS[new Date(`${body.forDate}T00:00:00Z`).getUTCDay()]!;
      const s = body.standing;
      const standing = s ? [s.workPattern, s.mealSource && `meals from ${s.mealSource.replace("_", " ")}`].filter(Boolean).join(", ") : "";
      const { value, meta } = await ai.json({
        system: BRIEF_SYSTEM,
        user: briefUser({ text, forDate: body.forDate, today: body.today, localTime: body.localTime, weekday, facts: body.recentFacts ?? [], standing: standing || null }),
        schema: AiBrief,
      });
      return {
        transcript,
        facts: toDayFacts(value),
        question: value.question ?? null,
        ai: { slot: meta.slot, model: meta.model, attempts: meta.attempts },
      };
    },
  };
}

export type BriefsService = ReturnType<typeof briefsService>;
