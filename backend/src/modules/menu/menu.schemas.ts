// LA7 · POST /v1/users/:id/menu/read (docs/LIFE_PLAN.md "Menu scan"): one menu page photo → the dishes printed on it.
// The AI only extracts; ranking happens on the phone (shared/domain/menu.ts). Images are never stored or logged.
import { z } from "zod";

import { MENU_TAGS } from "../../../../shared/domain/menu.js";
import { IMAGE_TYPES, MAX_IMAGE_BASE64 } from "../mealParse/parse.schemas.js";
import { DIETS } from "../users/users.schemas.js";

export const MAX_MENU_PAGES = 12;
export const MAX_DISHES_PER_PAGE = 60;
/** Sanity caps on one restaurant serving. */
const MAX_KCAL = 3000;
const MAX_GRAMS = 300;

export const MenuReadBody = z
  .object({
    imageBase64: z.string().min(100).max(MAX_IMAGE_BASE64),
    mimeType: z.enum(IMAGE_TYPES),
    page: z.number().int().min(1).max(MAX_MENU_PAGES),
    diet: z.enum(DIETS).nullable(),
  })
  .strict();

const range = (max: number) =>
  z
    .tuple([z.coerce.number(), z.coerce.number()])
    .transform(([a, b]) => [Math.max(0, Math.min(a, b)), Math.min(max, Math.max(a, b))] as [number, number])
    .refine(([, b]) => b > 0, "empty range");

/** What we ask the model for, per dish. A bad dish is dropped, never fails the page. */
export const AiDish = z.object({
  name: z.string().trim().min(1).max(80),
  gloss: z.string().trim().max(80).optional().catch(undefined),
  section: z.string().trim().max(40).optional().catch(undefined),
  price: z.coerce.number().positive().max(100_000).nullable().optional().catch(null),
  veg: z.boolean().nullable().catch(null),
  tags: z
    .array(z.string())
    .catch([])
    .transform((t) => t.filter((x): x is (typeof MENU_TAGS)[number] => (MENU_TAGS as readonly string[]).includes(x))),
  est: z.object({ kcal: range(MAX_KCAL), proteinG: range(MAX_GRAMS), carbsG: range(MAX_GRAMS), fatG: range(MAX_GRAMS) }),
});
export type AiDish = z.infer<typeof AiDish>;

export const AiMenu = z.object({
  unreadable: z.boolean().catch(false),
  restaurant: z.string().trim().max(80).optional().catch(undefined),
  cuisine: z.string().trim().max(40).optional().catch(undefined),
  currency: z.string().trim().max(8).optional().catch(undefined),
  dishes: z.array(z.unknown()).max(200).catch([]),
});

export type MenuReadResult = {
  page: number;
  unreadable: boolean;
  restaurant: string | null;
  cuisine: string | null;
  currency: string | null;
  dishes: AiDish[];
  ai: { slot: string; model: string; attempts: number };
};
