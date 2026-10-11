// P35 · Coach chat (D60). One system prompt per persona + the guardrails, the day's numbers from the phone, and the
// conversation so far. Safety checks run in code before and after the AI call (safety.ts). AI failures surface as the
// usual AI_UNAVAILABLE / RATE_LIMITED / AI_TIMEOUT errors; the phone shows "Coach is offline. Retry" (no fake reply).
import { notFound } from "../../http/errors.js";
import type { AiClient } from "../ai/ai.client.js";
import { AiCoachReply, type ChatMessage, type CoachChatResult, type CoachId, type DayContext } from "./coach.schemas.js";
import { coachSystem, coachUser } from "./prompts.js";
import { FALLBACK_REPLY, SUPPORT_REPLY, checkReply, needsSupport } from "./safety.js";

export function coachService(ai: AiClient, userExists: (id: string) => Promise<boolean>) {
  return {
    async chat(userId: string, input: { coach: CoachId; messages: ChatMessage[]; context: DayContext }): Promise<CoachChatResult> {
      if (!(await userExists(userId))) throw notFound("User");
      const last = input.messages[input.messages.length - 1]!.text;
      if (needsSupport(last)) return { reply: SUPPORT_REPLY, kind: "support", ai: null };

      const { value, meta } = await ai.json({
        system: coachSystem(input.coach, input.context),
        user: coachUser(input.context, input.messages),
        schema: AiCoachReply,
      });
      const reply = checkReply(value.reply);
      const used = { slot: meta.slot, model: meta.model, attempts: meta.attempts };
      return reply ? { reply, kind: "ai", ai: used } : { reply: FALLBACK_REPLY[input.coach], kind: "fallback", ai: used };
    },
  };
}

export type CoachService = ReturnType<typeof coachService>;
