// D85 · POST /v1/users/:id/plan/week: the model proposes the rest of the week (kcal, protein, steps, workout, a reason per
// day). The phone guards every number (shared/domain/aiPlan.ts) before using it, so this only shapes and passes it on.
import { z } from "zod";

import { DAY_TYPES } from "../../../../shared/domain/dayType.js";
import { BUDGET_BANDS, GOALS, MEAL_SOURCES, WORK_PATTERNS } from "../users/users.schemas.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const n = z.number().finite();

export const PlanWeekBody = z
  .object({
    today: date,
    /** The day the user is looking at or just briefed. */
    focusDate: date,
    goal: z.enum(GOALS).nullable(),
    floorKcal: n,
    sessionsTarget: z.number().int().min(0).max(7),
    standing: z
      .object({ mealSource: z.enum(MEAL_SOURCES).nullable(), budget: z.enum(BUDGET_BANDS).nullable(), workPattern: z.enum(WORK_PATTERNS).nullable() })
      .partial()
      .strict(),
    /** Up to 8 active fact texts. */
    facts: z.array(z.string().trim().max(200)).max(8),
    days: z
      .array(
        z
          .object({
            date,
            dayType: z.enum(DAY_TYPES),
            /** The day's brief in the user's words, if any. */
            brief: z.string().trim().max(400).nullable(),
            base: z.object({ kcal: n, proteinG: n, steps: n }).strict(),
            /** Past days: what was logged (null = not logged or not confirmed). */
            actual: z.object({ kcal: n.nullable(), proteinG: n.nullable(), steps: n.nullable(), trained: z.boolean() }).strict().nullable(),
            /** What the day's meals can realistically reach. */
            achievableProteinG: n.nullable(),
            canTrain: z.boolean(),
            /** The rules-based plan for the day, as a reference. */
            code: z.object({ kcal: n, proteinG: n, steps: n.nullable(), train: z.boolean() }).strict(),
          })
          .strict(),
      )
      .min(1)
      .max(7),
  })
  .strict();
export type PlanWeekBody = z.infer<typeof PlanWeekBody>;

/** What we ask the model for. Lenient per day: a broken day is dropped (the phone uses the code plan for it). */
export const AiPlanDay = z.object({
  date,
  kcal: z.coerce.number(),
  proteinG: z.coerce.number(),
  steps: z.coerce.number().nullable().catch(null),
  train: z.coerce.boolean().catch(false),
  reason: z.string().trim().max(300).optional().catch(undefined),
});
export const AiPlanWeek = z.object({ days: z.array(z.unknown()).max(14).catch([]), summary: z.string().trim().max(400).optional().catch(undefined) });

export type PlanWeekResult = {
  days: Array<z.infer<typeof AiPlanDay>>;
  summary: string | null;
  ai: { slot: string; model: string; attempts: number };
};
