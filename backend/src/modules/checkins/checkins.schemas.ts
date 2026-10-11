// Weekly check-ins = the target history (P28, D50). Computed on the phone (shared/domain/targets.ts
// weeklyCheckin) and synced as entity "checkin" once the user answers it.
import { z } from "zod";

export const CHECKIN_STATUSES = ["accepted", "kept", "skipped"] as const;

const kcal = z.number().int().min(800).max(8000);
const grams = z.number().int().min(0).max(1000);
const kg = z.number().min(20).max(400);

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
