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

/**
 * UX N1 · Screens a coach button may open. The phone maps each to a route, so the AI never picks a raw href.
 * gap: ways to close today's gap (eat) · move: the same, move tab · quick_log: the log sheet · log_weight · progress ·
 * checkin: this week's check-in · steps · record_walk: the GPS recorder set to walk · day: today's full numbers ·
 * share_day: the share card.
 */
export const COACH_SCREENS = [
  "gap",
  "move",
  "quick_log",
  "log_weight",
  "progress",
  "checkin",
  "steps",
  "record_walk",
  "day",
  "share_day",
] as const;

const label = z.string().trim().min(1).max(40);

/** UX N1 · A button under a coach reply. At most MAX_ACTIONS per reply; anything malformed is dropped, not an error. */
export const CoachAction = z.discriminatedUnion("type", [
  /** Logs a meal from plain food words ("2 roti, 1 katori dal"); the phone runs the usual text → food parser. */
  z.object({ type: z.literal("log_meal"), label, text: z.string().trim().min(1).max(200) }).strict(),
  z.object({ type: z.literal("plan_meal"), label, text: z.string().trim().min(1).max(200) }).strict(),
  z.object({ type: z.literal("save_idea"), label, text: z.string().trim().min(1).max(200) }).strict(),
  z.object({ type: z.literal("ate_meal"), label, text: z.string().trim().min(1).max(200) }).strict(),
  z.object({ type: z.literal("open"), label, screen: z.enum(COACH_SCREENS) }).strict(),
  /** Starts the user's next gym routine (the phone knows which; the server doesn't see routines). */
  z.object({ type: z.literal("start_workout"), label }).strict(),
]);
export type CoachAction = z.infer<typeof CoachAction>;
export const MAX_ACTIONS = 2;

// Actions are loose here so one bad button never fails the whole reply; coach.service.ts checks each one.
export const AiCoachReply = z.object({
  reply: z.string().trim().min(1).max(1500),
  actions: z.array(z.unknown()).max(6).optional(),
});

export type CoachChatResult = {
  reply: string;
  /** "support": a fixed safety reply (no AI); "fallback": the AI reply failed the filter and a safe line was used. */
  kind: "ai" | "support" | "fallback";
  /** UX N1 · Buttons to act on the reply in place. Empty for support replies. */
  actions: CoachAction[];
  ai: { slot: string; model: string; attempts: number } | null;
};
