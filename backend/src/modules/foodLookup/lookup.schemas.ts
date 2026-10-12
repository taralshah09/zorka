// Food lookup contracts: a food the catalog doesn't have → web search → AI-read nutrition the phone pre-fills on
// Create food. Mirrored by mobile/src/core/api/types.ts.
import { z } from "zod";

import type { SearchProvider } from "../nearby/search.client.js";

const Diet = z.enum(["veg", "eggetarian", "jain", "non_veg"]);

/** The serving choices Create food offers (S20). "g" means per 100 g. */
export const LOOKUP_UNITS = ["piece", "katori", "bowl", "plate_full", "glass", "serving", "g"] as const;
export type LookupUnit = (typeof LOOKUP_UNITS)[number];

export const LookupBody = z.object({ name: z.string().trim().min(1).max(80) }).strict();

/** What the AI returns for the search snippets. `hit` points at the result the numbers came from (URLs aren't trusted). */
export const AiLookup = z.object({
  found: z.boolean(),
  hit: z.number().int().min(0).nullable().catch(null),
  name: z.string().trim().min(1).max(80).nullable().catch(null),
  diet: Diet.nullable().catch(null),
  liquid: z.boolean().catch(false),
  homeCooked: z.boolean().catch(true),
  unit: z.enum(LOOKUP_UNITS).catch("serving"),
  gramsPerServing: z.coerce.number().positive().max(2000).nullable().catch(null),
  kcal: z.coerce.number().min(0).max(3000).nullable().catch(null),
  proteinG: z.coerce.number().min(0).max(300).catch(0),
  carbsG: z.coerce.number().min(0).max(500).catch(0),
  fatG: z.coerce.number().min(0).max(300).catch(0),
});

export type LookupFood = {
  name: string;
  diet: z.infer<typeof Diet> | null;
  liquid: boolean;
  homeCooked: boolean;
  /** One serving; unit "g" means 100 g. */
  serving: { unit: LookupUnit; grams: number };
  /** Macros for ONE serving. */
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type FoodLookupResult = {
  query: string;
  /** False when the web results didn't give usable numbers: the phone opens an empty form. */
  found: boolean;
  food: LookupFood | null;
  /** The page the numbers came from, shown under the form so the person can check it. */
  source: { title: string; url: string } | null;
  provider: SearchProvider | null;
};
