// P35 · Coach chat (D60). Mirrored by mobile/src/core/api/types.ts.
import { z } from "zod";

export const CoachId = z.enum(["drill_sergeant", "calm_mentor", "desi_legend"]);
export type CoachId = z.infer<typeof CoachId>;

const num = z.number().finite();

/** What the phone knows about the user's day. Every number the coach may quote comes from here. */
export const DayContext = z
  .object({
    name: z.string().trim().max(40).nullable().optional(),
    goal: z.enum(["lose_fat", "build_muscle", "maintain", "get_fitter"]).nullable().optional(),
    diet: z.enum(["veg", "eggetarian", "jain", "non_veg"]).nullable().optional(),
    localTime: z.string().regex(/^\d{2}:\d{2}$/),
    state: z.enum(["on_track", "under", "over", "done"]),
    targetKcal: num,
    floorKcal: num,
    kcalLeft: num,
    proteinLeftG: num,
    carbsLeftG: num,
    fatLeftG: num,
    eatenKcal: num,
    eatenProteinG: num,
    burnedKcal: num,
    steps: num.nullable().optional(),
    stepGoal: num,
    streakDays: num,
    workoutToday: z.boolean(),
    mealsToday: z.array(z.string().trim().max(120)).max(12),
  })
  .strict();
export type DayContext = z.infer<typeof DayContext>;

export const ChatMessage = z.object({ role: z.enum(["user", "coach"]), text: z.string().trim().min(1).max(1000) }).strict();
export type ChatMessage = z.infer<typeof ChatMessage>;

export const CoachChatBody = z
  .object({
    coach: CoachId,
    /** The conversation so far, oldest first; the last one is the user's new message. */
    messages: z
      .array(ChatMessage)
      .min(1)
      .max(20)
      .refine((m) => m[m.length - 1]!.role === "user", "the last message must be the user's"),
    context: DayContext,
  })
  .strict();

export const AiCoachReply = z.object({ reply: z.string().trim().min(1).max(1500) });

export type CoachChatResult = {
  reply: string;
  /** "support": a fixed safety reply (no AI); "fallback": the AI reply failed the filter and a safe line was used. */
  kind: "ai" | "support" | "fallback";
  ai: { slot: string; model: string; attempts: number } | null;
};
