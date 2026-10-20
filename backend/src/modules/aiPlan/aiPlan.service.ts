// D85 · The week planner: the week's context → the model → per-day proposals. Only days from today on, inside the week
// sent, are passed on; a broken day is dropped and the phone uses the code plan for it. The reason text is filtered
// like the coach's replies. Nothing is saved here; the phone guards the numbers (shared/domain/aiPlan.ts).
import { notFound } from "../../http/errors.js";
import type { AiClient } from "../ai/ai.client.js";
import { checkReply } from "../coach/safety.js";
import { AiPlanDay, AiPlanWeek, type PlanWeekBody, type PlanWeekResult } from "./aiPlan.schemas.js";
import { PLAN_WEEK_SYSTEM, planWeekUser } from "./prompts.js";

export function aiPlanService(ai: AiClient, userExists: (id: string) => Promise<boolean>) {
  return {
    async planWeek(userId: string, body: PlanWeekBody): Promise<PlanWeekResult> {
      if (!(await userExists(userId))) throw notFound("User");
      const { value, meta } = await ai.json({ system: PLAN_WEEK_SYSTEM, user: planWeekUser(body), schema: AiPlanWeek });
      const allowed = new Set(body.days.filter((d) => d.date >= body.today).map((d) => d.date));
      const seen = new Set<string>();
      const days = value.days
        .map((d) => AiPlanDay.safeParse(d))
        .flatMap((r) => (r.success ? [r.data] : []))
        .filter((d) => allowed.has(d.date) && !seen.has(d.date) && seen.add(d.date))
        .map((d) => ({ ...d, reason: d.reason ? (checkReply(d.reason) ?? undefined) : undefined }));
      return {
        days,
        summary: value.summary ? checkReply(value.summary) : null,
        ai: { slot: meta.slot, model: meta.model, attempts: meta.attempts },
      };
    },
  };
}

export type AiPlanService = ReturnType<typeof aiPlanService>;
