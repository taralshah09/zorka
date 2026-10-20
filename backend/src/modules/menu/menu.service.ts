// LA7 · Menu page reading. One vision call per page (AiClient.json takes one image; free vision models limit images per
// request). The image is passed straight to the AI client and dropped: never stored or logged. Dishes the model got
// wrong are dropped one by one; the page only fails when the AI does.
import { notFound } from "../../http/errors.js";
import type { AiClient } from "../ai/ai.client.js";
import { AiDish, AiMenu, MAX_DISHES_PER_PAGE, type MenuReadResult } from "./menu.schemas.js";
import { MENU_SYSTEM, menuUser } from "./prompts.js";

export function menuService(ai: AiClient, userExists: (id: string) => Promise<boolean>) {
  return {
    async read(
      userId: string,
      input: { imageBase64: string; mimeType: string; page: number; diet: string | null },
    ): Promise<MenuReadResult> {
      if (!(await userExists(userId))) throw notFound("User");
      const { value, meta } = await ai.json({
        system: MENU_SYSTEM,
        user: menuUser(input.page, input.diet),
        image: { base64: input.imageBase64, mimeType: input.mimeType },
        schema: AiMenu,
      });
      const dishes = value.dishes
        .map((d) => AiDish.safeParse(d))
        .flatMap((r) => (r.success ? [r.data] : []))
        .slice(0, MAX_DISHES_PER_PAGE);
      return {
        page: input.page,
        unreadable: value.unreadable || dishes.length === 0,
        restaurant: value.restaurant ?? null,
        cuisine: value.cuisine ?? null,
        currency: value.currency ?? null,
        dishes,
        ai: { slot: meta.slot, model: meta.model, attempts: meta.attempts },
      };
    },
  };
}

export type MenuService = ReturnType<typeof menuService>;
