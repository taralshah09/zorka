// P15–P17 · Meal parsing. Text → AI items → food DB match → confirm-sheet payload. Voice adds a
// speech-to-text step in front; photo swaps the text model for a vision model and may add one
// follow-up question. Nothing is saved here: the phone shows the confirm sheet and saves locally.
import {
  gramsPerUnit,
  portion,
  ZERO_MACROS,
  type FoodNutrition,
  type FoodUnit,
} from "../../../../shared/domain/food.js";
import { bestMatch, matchScore, parseUnit } from "../../../../shared/domain/foodMatch.js";
import { notFound } from "../../http/errors.js";
import type { AiClient, AiMeta } from "../ai/ai.client.js";
import type { FoodRecord } from "../foods/foods.repository.js";
import type { FoodDto } from "../foods/foods.schemas.js";
import { toFoodDto, type FoodsService } from "../foods/foods.service.js";
import {
  AiParse,
  UNCERTAIN_BELOW,
  type AiItem,
  type FollowUp,
  type ParsedItem,
  type ParseResult,
  type UncertainReason,
} from "./parse.schemas.js";
import { PHOTO_SYSTEM, PHOTO_USER, STT_VOCABULARY, TEXT_SYSTEM, textUser } from "./prompts.js";

const nutrition = (f: FoodRecord): FoodNutrition => ({
  per100g: f.per100g,
  defaultUnit: f.defaultUnit,
  units: f.units,
  liquid: f.liquid,
});

/** Matches one AI item to the catalog and works out its portion and why (if) it's uncertain. */
export function resolveItem(ai: AiItem, catalog: readonly FoodRecord[]): ParsedItem {
  const reasons: UncertainReason[] = [];
  if (ai.confidence < UNCERTAIN_BELOW) reasons.push("low_confidence");
  if (ai.quantity === null) reasons.push("vague_quantity");
  const quantity = ai.quantity ?? 1;
  const saidUnit = parseUnit(ai.unit);
  if (ai.unit && !saidUnit) reasons.push("unit_unknown");

  const match = bestMatch(ai.name, catalog);
  if (!match) {
    reasons.push("no_match");
    return {
      query: ai.name,
      food: null,
      matchScore: null,
      quantity,
      unit: saidUnit ?? "serving",
      grams: 0,
      macros: ZERO_MACROS,
      confidence: ai.confidence,
      uncertain: true,
      reasons,
    };
  }

  const food = nutrition(match.food);
  let unit: FoodUnit = saidUnit ?? match.food.defaultUnit;
  // "plate" without a size → full plate, but only if the food has plates at all.
  if (gramsPerUnit(food, unit) === null) {
    if (saidUnit && !reasons.includes("unit_unknown")) reasons.push("unit_unknown");
    unit = match.food.defaultUnit;
  }
  const { grams, macros } = portion(food, quantity, unit);
  return {
    query: ai.name,
    food: toFoodDto(match.food),
    matchScore: match.score,
    quantity,
    unit,
    grams,
    macros,
    confidence: ai.confidence,
    uncertain: reasons.length > 0,
    reasons,
  };
}

/** AB6 · A parsed item plus what the assistant needs to judge and repair it: the runner-up's score and the top 3 other
 *  foods (the chip's alternatives, "dal tadka · dal makhani · dal fry"). */
export type AssistantParsedItem = ParsedItem & { runnerUp: number | null; alternatives: FoodDto[] };

const ALTERNATIVES = 3;
const ALTERNATIVE_MIN_SCORE = 0.35;

export function withAlternatives(item: ParsedItem, catalog: readonly FoodRecord[]): AssistantParsedItem {
  const ranked = catalog
    .map((food, i) => ({ food, i, score: matchScore(item.query, food) }))
    .filter((x) => x.score >= ALTERNATIVE_MIN_SCORE && x.food.id !== item.food?.id)
    .sort((a, b) => b.score - a.score || a.i - b.i);
  return {
    ...item,
    runnerUp: ranked[0]?.score ?? null,
    alternatives: ranked.slice(0, ALTERNATIVES).map((x) => toFoodDto(x.food)),
  };
}

/** Option sets for the single photo follow-up, in order of preference (D33). */
const FOLLOW_UPS: { question: string; needs: FoodUnit[]; options: FollowUp["options"] }[] = [
  {
    question: "Half plate or full?",
    needs: ["plate_half", "plate_full"],
    options: [
      { label: "Half plate", quantity: 1, unit: "plate_half" },
      { label: "Full plate", quantity: 1, unit: "plate_full" },
    ],
  },
  {
    question: "About one katori, or a bowl?",
    needs: ["katori", "bowl"],
    options: [
      { label: "1 katori", quantity: 1, unit: "katori" },
      { label: "1 bowl", quantity: 1, unit: "bowl" },
    ],
  },
  {
    question: "How many pieces?",
    needs: ["piece"],
    options: [1, 2, 3, 4].map((n) => ({ label: String(n), quantity: n, unit: "piece" as FoodUnit })),
  },
];

/** At most one question per photo, covering every portion-uncertain item it applies to. */
export function buildFollowUp(aiItems: readonly AiItem[], items: readonly ParsedItem[]): FollowUp | null {
  const flagged = items
    .map((it, i) => ({ it, i }))
    .filter(({ it, i }) => it.food && aiItems[i]?.portionUncertain);
  for (const set of FOLLOW_UPS) {
    const fits = flagged.filter(({ it }) => set.needs.every((u) => it.food!.units.some((x) => x.unit === u)));
    if (fits.length) {
      // Name the dish when the question covers just one.
      const question = fits.length === 1 ? `${fits[0]!.it.food!.name}: ${set.question.toLowerCase()}` : set.question;
      return { question, itemIndexes: fits.map((f) => f.i), options: set.options };
    }
  }
  return null;
}

export function parseService(ai: AiClient, foods: FoodsService, userExists: (id: string) => Promise<boolean>) {
  /** Starts loading the user's foods so it runs while the AI call is in flight. */
  function loadCatalog(userId: string): Promise<FoodRecord[]> {
    const p = foods.candidates(userId);
    p.catch(() => {}); // awaited later; don't report it as unhandled if the AI call fails first
    return p;
  }

  async function finish(
    catalogP: Promise<FoodRecord[]>,
    source: ParseResult["source"],
    started: number,
    aiItems: AiItem[],
    meta: AiMeta,
    extra: { transcript?: string; sttMs?: number; photo?: boolean },
  ): Promise<ParseResult> {
    const t0 = Date.now();
    const catalog = await catalogP;
    const items = aiItems.map((i) => resolveItem(i, catalog));
    const followUp = extra.photo ? buildFollowUp(aiItems, items) : null;
    const matchMs = Date.now() - t0;
    return {
      source,
      transcript: extra.transcript ?? null,
      items,
      followUp,
      timings: { sttMs: extra.sttMs ?? null, aiMs: meta.ms, matchMs, totalMs: Date.now() - started },
      ai: { slot: meta.slot, model: meta.model, attempts: meta.attempts },
    };
  }

  async function requireUser(userId: string) {
    if (!(await userExists(userId))) throw notFound("User");
  }

  async function fromText(userId: string, text: string, source: "text" | "voice", started: number, stt?: { transcript: string; ms: number }) {
    const catalogP = loadCatalog(userId);
    const { value, meta } = await ai.json({ system: TEXT_SYSTEM, user: textUser(text), schema: AiParse });
    return finish(catalogP, source, started, value.items, meta, stt ? { transcript: stt.transcript, sttMs: stt.ms } : {});
  }

  return {
    /** P15: typed text. */
    async parseText(userId: string, text: string): Promise<ParseResult> {
      const started = Date.now();
      await requireUser(userId);
      return fromText(userId, text, "text", started);
    },

    /** P16: a voice note. An empty transcript returns no items (S13 "no speech detected"). */
    async parseVoice(userId: string, audio: { base64: string; mimeType: string }): Promise<ParseResult> {
      const started = Date.now();
      await requireUser(userId);
      const { text, meta } = await ai.transcribe(audio, STT_VOCABULARY);
      if (!text.replace(/[^a-z0-9]/gi, "")) {
        return {
          source: "voice",
          transcript: "",
          items: [],
          followUp: null,
          timings: { sttMs: meta.ms, aiMs: 0, matchMs: 0, totalMs: Date.now() - started },
          ai: { slot: meta.slot, model: meta.model, attempts: meta.attempts },
        };
      }
      return fromText(userId, text, "voice", started, { transcript: text, ms: meta.ms });
    },

    /**
     * AB2 · The assistant's log_meal and correct: the words the router copied out → items, each with its runner-up
     * score and alternatives (AB6). The caller has already checked the user.
     */
    async parseForAssistant(userId: string, text: string): Promise<{ items: AssistantParsedItem[]; ai: ParseResult["ai"] }> {
      const catalogP = loadCatalog(userId);
      const { value, meta } = await ai.json({ system: TEXT_SYSTEM, user: textUser(text), schema: AiParse });
      const catalog = await catalogP;
      return {
        items: value.items.map((i) => withAlternatives(resolveItem(i, catalog), catalog)),
        ai: { slot: meta.slot, model: meta.model, attempts: meta.attempts },
      };
    },

    /** P17: a meal photo. No items = "Couldn't tell. Try search?" on the phone. */
    async parsePhoto(userId: string, image: { base64: string; mimeType: string }): Promise<ParseResult> {
      const started = Date.now();
      await requireUser(userId);
      const catalogP = loadCatalog(userId);
      const { value, meta } = await ai.json({ system: PHOTO_SYSTEM, user: PHOTO_USER, image, schema: AiParse });
      return finish(catalogP, "photo", started, value.items, meta, { photo: true });
    },
  };
}

export type ParseService = ReturnType<typeof parseService>;
