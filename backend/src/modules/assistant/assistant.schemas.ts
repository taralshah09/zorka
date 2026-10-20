// AB1/AB2 · Assistant Bar contracts (docs/ASSISTANT_BAR_PLAN.md, D89–D98). Mirrored by mobile/src/core/api/types.ts.
//
// The router's output is checked twice: here with a strict zod schema per action (an unknown kind, an extra field such
// as `kcal`, or a bad type drops that action), then by shared/domain/assistant.ts `planTurn` (bounds, dates, turn
// rules). The phone runs `planTurn` again before anything is written (D96).
import { z } from "zod";

import {
  ACTION_KINDS,
  ASK_TOPICS,
  ASSISTANT_SCREENS,
  TURN_TEXT_MAX,
  type AssistantAction,
  type Confidence,
  type RejectReason,
  type Tier,
} from "../../../../shared/domain/assistant.js";
import type { AnswerCard, AnswerFacts } from "../../../../shared/domain/assistantFacts.js";
import { DAY_TYPES, type DayType } from "../../../../shared/domain/dayType.js";
import { MEAL_TYPES, type FoodUnit, type MealType } from "../../../../shared/domain/food.js";
import type { DayFacts } from "../../../../shared/domain/life.js";
import { ChatMessage, CoachId, DayContext } from "../coach/coach.schemas.js";
import type { GymParsedSet } from "../gymParse/gymParse.schemas.js";
import type { AssistantParsedItem } from "../mealParse/parse.service.js";
import { AUDIO_TYPES, MAX_AUDIO_BASE64 } from "../mealParse/parse.schemas.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const span = z.string().trim().min(1).max(300);
const num = z.number().finite();

// ── What the router (AI) may say ─────────────────────────────────────────────────────────────────

/**
 * One action, exactly as the router must write it. No action carries a calorie, protein or step number (D91), and no
 * user id (identity comes from the URL, Guardrails 5). `confidence` is never the router's: the server sets it from the
 * transcript and the food match.
 */
export const RouterAction = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("log_meal"), span, mealType: z.enum(MEAL_TYPES).optional(), date: date.optional() }),
  z.strictObject({ kind: z.literal("log_water"), glasses: z.number().int().min(1).max(20) }),
  z.strictObject({ kind: z.literal("log_workout"), span, date: date.optional() }),
  z.strictObject({ kind: z.literal("start_activity"), activity: z.enum(["walk", "run", "ride"]) }),
  z.strictObject({ kind: z.literal("stop_activity") }),
  z.strictObject({ kind: z.literal("log_weight"), kg: num, date: date.optional() }),
  z.strictObject({ kind: z.literal("set_day"), dayType: z.enum(DAY_TYPES), date, note: z.string().trim().max(120).optional() }),
  z.strictObject({ kind: z.literal("plan_meal"), span, mealType: z.enum(MEAL_TYPES), date: date.optional() }),
  z.strictObject({
    kind: z.literal("remind_me"),
    what: z.string().trim().min(1).max(120),
    time: z.string().regex(/^\d{1,2}:\d{2}$/),
    date: date.optional(),
  }),
  z.strictObject({ kind: z.literal("ask"), topic: z.enum(ASK_TOPICS), date: date.optional() }),
  z.strictObject({ kind: z.literal("correct"), index: z.number().int().min(0).max(4), span }),
  z.strictObject({ kind: z.literal("undo") }),
  z.strictObject({ kind: z.literal("open"), screen: z.enum(ASSISTANT_SCREENS) }),
  z.strictObject({
    kind: z.literal("clarify"),
    question: z.string().trim().min(1).max(160),
    options: z.array(z.string().trim().min(1).max(40)).max(4),
  }),
  z.strictObject({ kind: z.literal("out_of_scope") }),
]);
export type RouterAction = z.infer<typeof RouterAction>;

/** Loose on purpose: one bad action is dropped on its own, it never fails the turn. */
export const AiRouterOutput = z.object({ actions: z.array(z.unknown()).max(12) });

export const AiPhrasing = z.object({ reply: z.string().trim().min(1).max(600) });

// ── What the phone sends ─────────────────────────────────────────────────────────────────────────

const factsDay = z
  .object({
    date,
    kcal: num.nullable(),
    proteinG: num.nullable(),
    targetKcal: num,
    targetProteinG: num,
    trained: z.boolean(),
  })
  .strict();

/** shared/domain/assistantFacts.ts AssistantFactsInput: the phone's numbers for `ask` (D90). */
export const AssistantFactsInput = z
  .object({
    today: date,
    day: z
      .object({
        targetKcal: num,
        eatenKcal: num,
        targetProteinG: num,
        eatenProteinG: num,
        steps: num.nullable(),
        stepGoal: num,
        glasses: num.nullable(),
        waterGoal: num.nullable(),
        workoutToday: z.boolean(),
        mealsLogged: num,
        coverage: z.enum(["complete", "partial", "unknown", "pending"]),
      })
      .strict(),
    streak: z.object({ current: num, best: num, atRisk: z.boolean() }).strict().nullable().optional(),
    week: z
      .object({ days: z.array(factsDay).max(7), sessionsDone: num, sessionsTarget: num })
      .strict()
      .nullable()
      .optional(),
    trend: z
      .object({ trendKg: num.nullable(), weeklyChangeKg: num.nullable(), weighIns: num })
      .strict()
      .nullable()
      .optional(),
    plan: z
      .object({
        dayType: z.enum(DAY_TYPES),
        kcal: num,
        proteinG: num,
        steps: num.nullable(),
        items: z.array(z.string().trim().max(120)).max(6),
        why: z.array(z.string().trim().max(160)).max(4),
      })
      .strict()
      .nullable()
      .optional(),
    eat: z
      .array(z.object({ name: z.string().trim().min(1).max(80), kcal: num, proteinG: num }).strict())
      .max(5)
      .nullable()
      .optional(),
  })
  .strict();

const words = (max: number, count: number) => z.array(z.string().trim().min(1).max(max)).max(count);

export const AssistantTurnBody = z
  .object({
    /** Typed text, or a voice note (one of the two). */
    text: z.string().trim().min(1).max(TURN_TEXT_MAX).optional(),
    audioBase64: z.string().min(100).max(MAX_AUDIO_BASE64).optional(),
    mimeType: z.enum(AUDIO_TYPES).optional(),
    coach: CoachId,
    context: DayContext,
    facts: AssistantFactsInput,
    /** What the phone knows for the turn rules (shared TurnContext) and for "no, I said dal" / "and yesterday?". */
    turn: z
      .object({
        activityRunning: z.boolean(),
        lastWeightKg: num.nullable(),
        previous: z
          .object({
            actions: z
              .array(
                z
                  .object({
                    kind: z.enum(ACTION_KINDS as [string, ...string[]]),
                    span: z.string().trim().max(300).optional(),
                    topic: z.enum(ASK_TOPICS).optional(),
                    date: date.optional(),
                  })
                  .strict(),
              )
              .max(5),
            clarify: z.object({ question: z.string().trim().max(160), options: words(40, 4) }).strict().nullable().optional(),
          })
          .strict()
          .nullable(),
      })
      .strict(),
    /** AB6 · For the speech-to-text hint and matching: the user's usual meals, learned aliases, recent foods, exercises. */
    vocab: z
      .object({
        usuals: words(80, 12),
        aliases: z.array(z.object({ heard: z.string().trim().min(1).max(60), means: z.string().trim().min(1).max(80) }).strict()).max(30),
        recent: words(80, 20),
        exercises: words(60, 20),
      })
      .partial()
      .strict()
      .optional(),
    /** The Zorka thread, oldest first: the last 10 messages (same window as coach chat). */
    thread: z.array(ChatMessage).max(10).default([]),
  })
  .strict()
  .refine((b) => !!b.text !== !!b.audioBase64, "send text or audioBase64, not both")
  .refine((b) => !b.audioBase64 || !!b.mimeType, "mimeType is required with audioBase64");
export type AssistantTurnBody = z.infer<typeof AssistantTurnBody>;

// ── What the server answers ──────────────────────────────────────────────────────────────────────

/** A question the phone shows as option chips; picking one patches the action and runs it. */
export type AskPatch = { mealType: MealType } | { itemIndex: number; quantity: number; unit: FoodUnit };
export type AskQuestion = { question: string; options: { label: string; patch: AskPatch }[] };

export type Resolution =
  | { kind: "meal"; items: AssistantParsedItem[]; mealType: MealType }
  | { kind: "workout"; sets: GymParsedSet[]; usual: boolean }
  | { kind: "day"; facts: DayFacts; dayType: DayType; question: string | null }
  | { kind: "answer"; topic: AnswerFacts["topic"]; date: string; known: boolean; lines: string[]; numbers: number[]; card: AnswerCard | null };

export type TurnItem = {
  action: AssistantAction;
  tier: Tier;
  resolved: Resolution | null;
  /** Set when tier is "ask" for a missing detail (meal type, portion). */
  ask: AskQuestion | null;
  /** The receipt line for this action (template words). */
  line: string;
};

export type DropReason = RejectReason | "schema" | "span_not_heard";

export type AssistantTurnResult = {
  heard: { text: string; source: "voice" | "text"; confidence: Confidence };
  /** "support": a fixed safety reply, nothing ran. "no_speech": nothing was heard. */
  kind: "actions" | "support" | "no_speech";
  items: TurnItem[];
  dropped: { kind: string | null; reason: DropReason }[];
  reply: string;
  replyKind: "ai" | "template" | "support" | "redirect" | "none";
  timings: { sttMs: number | null; routerMs: number; resolveMs: number; phraseMs: number; totalMs: number };
  ai: { slot: string; model: string; attempts: number } | null;
};
