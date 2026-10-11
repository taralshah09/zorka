// P15–P17 · Meal parsing contracts (D31–D33). One pipeline for text, voice and photo:
// input → (speech-to-text | vision) → AI items { name, quantity, unit, confidence } → match against
// the food DB → a confirm-sheet payload with uncertain items flagged.
import { z } from "zod";

import { MEAL_TYPES, type FoodUnit, type Macros } from "../../../../shared/domain/food.js";
import type { FoodDto } from "../foods/foods.schemas.js";

/** Below this confidence an item is "uncertain" (D31). */
export const UNCERTAIN_BELOW = 0.7;

/** Base64 is ~4/3 of the raw size. Voice: ≤ 60 s m4a (~250 KB raw). Photo: 1024 px JPEG (~300 KB). */
export const MAX_AUDIO_BASE64 = 1_500_000;
export const MAX_IMAGE_BASE64 = 4_000_000;

export const TextParseBody = z
  .object({ text: z.string().trim().min(1).max(500), mealType: z.enum(MEAL_TYPES).optional() })
  .strict();

export const AUDIO_TYPES = ["audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac", "audio/mpeg", "audio/wav", "audio/webm", "audio/ogg"] as const;
export const VoiceParseBody = z
  .object({
    audioBase64: z.string().min(100).max(MAX_AUDIO_BASE64),
    mimeType: z.enum(AUDIO_TYPES),
    mealType: z.enum(MEAL_TYPES).optional(),
  })
  .strict();

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PhotoParseBody = z
  .object({
    imageBase64: z.string().min(100).max(MAX_IMAGE_BASE64),
    mimeType: z.enum(IMAGE_TYPES),
    mealType: z.enum(MEAL_TYPES).optional(),
  })
  .strict();

/** What we ask the model for. Lenient: a bad field degrades to "unknown", never fails the item. */
export const AiItem = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.coerce.number().positive().max(100).nullable().catch(null),
  unit: z.string().trim().max(30).nullable().catch(null),
  confidence: z.coerce.number().min(0).max(1).catch(0.5),
  /** Photo only: the portion can't be judged from the picture (e.g. half vs full plate). */
  portionUncertain: z.boolean().catch(false).optional(),
});
export const AiParse = z.object({ items: z.array(AiItem).max(30) });
export type AiItem = z.infer<typeof AiItem>;

export type UncertainReason = "low_confidence" | "no_match" | "vague_quantity" | "unit_unknown";

export type ParsedItem = {
  /** The food as the person said it ("salad"). */
  query: string;
  food: FoodDto | null;
  matchScore: number | null;
  quantity: number;
  unit: FoodUnit;
  grams: number;
  macros: Macros;
  confidence: number;
  uncertain: boolean;
  reasons: UncertainReason[];
};

/** One question for the whole meal (photo flow): "Half plate or full?" */
export type FollowUp = {
  question: string;
  itemIndexes: number[];
  options: { label: string; quantity: number; unit: FoodUnit }[];
};

export type ParseResult = {
  source: "text" | "voice" | "photo";
  transcript: string | null;
  items: ParsedItem[];
  followUp: FollowUp | null;
  timings: { sttMs: number | null; aiMs: number; matchMs: number; totalMs: number };
  ai: { slot: string; model: string; attempts: number };
};
