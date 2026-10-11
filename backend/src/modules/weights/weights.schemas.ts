// Weigh-ins (P27). Logged on the phone and synced as entity "weight_log" (D23). Several on one day are averaged
// for the trend (shared/domain/progress.ts).
import { z } from "zod";

export const WeightLogData = z
  .object({
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    kg: z.number().min(20).max(400),
    loggedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type WeightLogData = z.infer<typeof WeightLogData>;

export type WeightLogDto = WeightLogData & { id: string; clientUpdatedAt: string };
