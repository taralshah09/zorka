// Weekly check-ins = the target history (P28, D50). Computed on the phone (shared/domain/targets.ts
// weeklyCheckin) and synced as entity "checkin" once the user answers it.
import { z } from "zod";

export const CHECKIN_STATUSES = ["accepted", "kept", "skipped"] as const;

const kcal = z.number().int().min(800).max(8000);
const grams = z.number().int().min(0).max(1000);
const kg = z.number().min(20).max(400);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const grade = z.enum(["A", "B", "C", "D"]);
const count = z.number().int().min(0).max(7);
const line = z.string().max(300);

/** D87: the week's report card (shared/domain/report.ts WeekReport). Stored as written; the phone shows it as is. */
export const WeekReportData = z
  .object({
    start: date,
    end: date,
    grade,
    score: z.number().min(0).max(100),
    daysLogged: count,
    kcal: z.object({ avg: z.number().min(0).max(20_000).nullable(), target: z.number().min(0).max(20_000), onTargetDays: count, grade: grade.nullable() }).strict(),
    protein: z.object({ avg: z.number().min(0).max(2000).nullable(), target: z.number().min(0).max(2000), hitDays: count, grade: grade.nullable() }).strict(),
    steps: z
      .object({ avg: z.number().min(0).max(200_000).nullable(), target: z.number().min(0).max(200_000).nullable(), hitDays: count, days: count, grade: grade.nullable() })
      .strict(),
    workouts: z.object({ done: z.number().int().min(0).max(50), planned: z.number().int().min(0).max(50), missed: z.array(date).max(7), grade: grade.nullable() }).strict(),
    sickDays: count,
    wentWell: z.array(line).max(6),
    toWorkOn: z.array(line).max(6),
    focus: line.nullable(),
  })
  .strict();
export type WeekReportData = z.infer<typeof WeekReportData>;

export const CheckinData = z
  .object({
    phaseId: z.string().uuid().nullable(),
    checkinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(CHECKIN_STATUSES),
    loggedDays: z.number().int().min(0).max(7),
    previousKcal: kcal,
    newKcal: kcal.nullable(),
    proteinG: grams.nullable(),
    carbsG: grams.nullable(),
    fatG: grams.nullable(),
    avgIntakeKcal: z.number().min(0).max(20_000).nullable(),
    estimatedBurnKcal: z.number().min(-20_000).max(20_000).nullable(),
    trendStartKg: kg.nullable(),
    trendEndKg: kg.nullable(),
    capped: z.boolean(),
    // Optional: check-ins answered before D87 (and older apps) have none.
    report: WeekReportData.nullable().optional(),
  })
  .strict()
  .refine(
    (c) => c.status === "skipped" || (c.newKcal != null && c.proteinG != null && c.carbsG != null && c.fatG != null),
    {
      message: "accepted and kept check-ins need the offered targets",
      path: ["newKcal"],
    },
  );
export type CheckinData = z.infer<typeof CheckinData>;

export type CheckinDto = CheckinData & { id: string; clientUpdatedAt: string };
