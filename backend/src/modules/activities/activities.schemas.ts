// GPS activities (P24–P26). Recorded on the phone and synced as entity "activity" once finished (D23).
// The route travels as compact tuples so a long run stays a small payload.
import { z } from "zod";

import type { ActivityKind } from "../../../../shared/domain/activity.js";

export const ACTIVITY_KINDS = ["run", "walk", "ride"] as const satisfies readonly ActivityKind[];

/** [latitude, longitude, timestamp ms, accuracy m, segment, active ms] */
export const ActivityPoint = z.tuple([
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
  z.number().int().nonnegative(),
  z.number().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
]);
export type ActivityPoint = z.infer<typeof ActivityPoint>;

export const ActivityData = z
  .object({
    kind: z.enum(ACTIVITY_KINDS),
    weightKg: z.number().positive().max(500),
    startedAt: z.string().datetime({ offset: true }),
    endedAt: z.string().datetime({ offset: true }),
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    elapsedMs: z.number().int().min(0).max(7 * 24 * 3_600_000),
    points: z.array(ActivityPoint).max(50_000),
  })
  .strict()
  .refine((a) => new Date(a.endedAt).getTime() >= new Date(a.startedAt).getTime(), {
    message: "endedAt is before startedAt",
    path: ["endedAt"],
  });
export type ActivityData = z.infer<typeof ActivityData>;

export type ActivityDto = {
  id: string;
  kind: ActivityKind;
  weightKg: number;
  startedAt: string;
  endedAt: string;
  localDate: string;
  elapsedMs: number;
  points: ActivityPoint[];
  clientUpdatedAt: string;
};
