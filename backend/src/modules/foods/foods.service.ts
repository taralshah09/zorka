// Foods: catalog for the phone (cached on the device for offline search), server-side search, and the
// P13 custom-food sync handler. The catalog is small (a few hundred rows), so search ranks in memory.
import { rankFoods } from "../../../../shared/domain/foodMatch.js";
import { notFound } from "../../http/errors.js";
import { lwwGuard, parseOpData, type EntityHandler } from "../sync/lww.js";
import type { FoodRecord, FoodsRepository } from "./foods.repository.js";
import { CustomFoodData, type FoodDto } from "./foods.schemas.js";

export function toFoodDto(r: FoodRecord): FoodDto {
  return {
    id: r.id,
    name: r.name,
    aliases: r.aliases,
    cuisine: r.cuisine,
    category: r.category,
    diet: r.diet,
    homeCooked: r.homeCooked,
    liquid: r.liquid,
    per100g: r.per100g,
    defaultUnit: r.defaultUnit,
    units: r.units,
    source: r.source,
    custom: r.custom,
    updatedAt: r.updatedAt.toISOString(),
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function foodsService(repo: FoodsRepository) {
  async function requireUser(userId: string) {
    if (!(await repo.userExists(userId))) throw notFound("User");
  }

  /** P13: create/update/delete a user-created food from the outbox. */
  const syncCustomFood: EntityHandler = async (userId, op) => {
    const existing = await repo.findFood(op.id);
    if (existing && !existing.custom) {
      return { opId: op.opId, status: "rejected", message: "Curated foods can't be changed" };
    }
    const guard = lwwGuard(
      userId,
      op,
      existing ? { ownerId: existing.ownerUserId, clientUpdatedAt: existing.clientUpdatedAt } : null,
    );
    if (guard) return guard;

    const at = new Date(op.clientUpdatedAt);
    if (op.action === "delete") {
      if (existing) await repo.softDeleteCustomFood(op.id, at);
      return { opId: op.opId, status: "applied" };
    }

    const parsed = parseOpData(CustomFoodData, op);
    if (!parsed.ok) return parsed.result;
    const d = parsed.data;
    const per100 = 100 / d.serving.grams;
    const base = d.liquid ? "ml" : "g";
    await repo.upsertCustomFood({
      id: op.id,
      ownerUserId: userId,
      name: d.name,
      diet: d.diet,
      category: d.category,
      homeCooked: d.homeCooked,
      liquid: d.liquid,
      per100g: {
        kcal: Math.round(d.kcal * per100),
        proteinG: round1(d.proteinG * per100),
        carbsG: round1(d.carbsG * per100),
        fatG: round1(d.fatG * per100),
      },
      defaultUnit: d.serving.unit,
      units:
        d.serving.unit === base
          ? [{ unit: base, grams: 1 }]
          : [
              { unit: d.serving.unit, grams: d.serving.grams },
              { unit: base, grams: 1 },
            ],
      clientUpdatedAt: at,
    });
    return { opId: op.opId, status: "applied" };
  };

  return {
    /** Everything the phone caches: curated foods + the user's own. */
    async catalog(userId: string): Promise<FoodDto[]> {
      await requireUser(userId);
      return (await repo.listCatalog(userId)).map(toFoodDto);
    },

    /** Ranked search. Empty query returns nothing (the phone shows recents instead). */
    async search(userId: string | null, q: string, limit: number): Promise<FoodDto[]> {
      if (userId) await requireUser(userId);
      if (!q.trim()) return [];
      return rankFoods(q, await repo.listCatalog(userId), 0.35, limit).map(toFoodDto);
    },

    async get(foodId: string, userId: string | null = null): Promise<FoodDto> {
      const food = await repo.findFood(foodId);
      if (!food || food.deletedAt || (food.custom && food.ownerUserId !== userId)) throw notFound("Food");
      return toFoodDto(food);
    },

    /** For the AI parser (P15): curated + the user's foods, as records. */
    candidates: (userId: string) => repo.listCatalog(userId),

    existingIds: (ids: string[]) => repo.existingIds(ids),

    syncCustomFood,
  };
}

export type FoodsService = ReturnType<typeof foodsService>;
