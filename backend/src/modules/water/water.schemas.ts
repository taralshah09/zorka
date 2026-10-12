// Water taps (glasses). Logged on the phone and synced as entity "water_log" (D23). A day's glasses are the sum of its
// logs; undo deletes the latest one.
import { z } from "zod";

import { WATER_LOG_MAX_GLASSES } from "../../../../shared/domain/water.js";

export const WaterLogData = z
  .object({
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    glasses: z.number().int().min(1).max(WATER_LOG_MAX_GLASSES),
    loggedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type WaterLogData = z.infer<typeof WaterLogData>;

export type WaterLogDto = WaterLogData & { id: string; clientUpdatedAt: string };
