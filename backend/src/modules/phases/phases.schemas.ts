// Phases as projects (P29, D51). Created and closed on the phone, synced as entity "phase". One active phase per
// user (closedDate null) is kept by the phone; the summary is frozen when the phase is closed.
import { z } from "zod";

import { GOALS } from "../users/users.schemas.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const num = z.number().finite();

/** shared/domain/progress.ts PhaseSummary */
export const PhaseSummary = z
  .object({
    days: z.number().int().min(1),
    weeks: z.number().int().min(1),
    startTrendKg: num.nullable(),
    endTrendKg: num.nullable(),
    changeKg: num.nullable(),
    loggedDays: z.number().int().min(0),
    avgKcal: num.nullable(),
    avgProteinG: num.nullable(),
    workouts: z.number().int().min(0),
    prs: z.number().int().min(0),
    distanceKm: num.min(0),
  })
  .strict();

export const PhaseData = z
  .object({
    name: z.string().trim().min(1).max(60),
    goal: z.enum(GOALS),
    startDate: date,
    endDate: date.nullable(),
    targetWeightKg: z.number().min(30).max(300).nullable(),
    kcal: z.number().int().min(800).max(8000).nullable(),
    proteinG: z.number().int().min(0).max(1000).nullable(),
    closedDate: date.nullable(),
    summary: PhaseSummary.nullable(),
  })
  .strict()
  .refine((p) => p.endDate == null || p.endDate >= p.startDate, {
    message: "endDate is before startDate",
    path: ["endDate"],
  })
  .refine((p) => p.closedDate == null || p.closedDate >= p.startDate, {
    message: "closedDate is before startDate",
    path: ["closedDate"],
  });
export type PhaseData = z.infer<typeof PhaseData>;

export type PhaseDto = PhaseData & { id: string; clientUpdatedAt: string };
