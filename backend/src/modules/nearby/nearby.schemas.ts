// P34 · Nearby Zomato/Blinkit options (D59). Mirrored by mobile/src/core/api/types.ts.
import { z } from "zod";

const Diet = z.enum(["veg", "eggetarian", "jain", "non_veg"]);
const name = z.string().trim().min(1).max(80);

/** Only a locality/city or a pincode leaves the phone, never coordinates. */
export const NearbyBody = z
  .object({
    area: z
      .object({
        locality: name.optional(),
        city: name.optional(),
        pincode: z.string().regex(/^[1-9][0-9]{5}$/, "6-digit Indian pincode").optional(),
      })
      .strict()
      .refine((a) => !!a.pincode || !!a.city || !!a.locality, "locality, city or pincode is required"),
    diet: Diet,
  })
  .strict();
export type NearbyArea = z.infer<typeof NearbyBody>["area"];

/** What the AI returns for the search snippets. `hit` points at the result the dish came from (URLs aren't trusted). */
export const AiNearby = z.object({
  dishes: z
    .array(
      z.object({
        hit: z.number().int().min(0),
        name: z.string().trim().min(1).max(80),
        restaurant: z.string().trim().max(80).nullable().optional(),
        kcal: z.number().min(0).max(3000),
        proteinG: z.number().min(0).max(300),
        carbsG: z.number().min(0).max(500),
        fatG: z.number().min(0).max(300),
        diet: Diet.nullable(),
        junk: z.boolean(),
      }),
    )
    .max(12),
});

export type NearbySource = "zomato" | "blinkit";

export type NearbyOption = {
  id: string;
  source: NearbySource;
  name: string;
  restaurant: string | null;
  url: string;
  macros: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  diet: z.infer<typeof Diet> | null;
  /** Always true: restaurant and shop items rarely list macros (D59). */
  estimate: true;
};

export type NearbyResult = {
  areaKey: string;
  fetchedAt: string;
  expiresAt: string;
  options: NearbyOption[];
  /** Search services that answered (Zomato, Blinkit). */
  providers: string[];
  /** One of the two searches failed; options are partial. */
  partial: boolean;
};
