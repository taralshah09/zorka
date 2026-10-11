// Meal logs: the "meal_log" sync handler (P12) and a per-day list.
import { notFound } from "../../http/errors.js";
import { lwwGuard, parseOpData, type EntityHandler } from "../sync/lww.js";
import type { MealRecord, MealsRepository } from "./meals.repository.js";
import { MealLogData, type MealLogDto } from "./meals.schemas.js";

const toDto = ({ userId: _u, deletedAt: _d, loggedAt, clientUpdatedAt, ...m }: MealRecord): MealLogDto => ({
  ...m,
  loggedAt: loggedAt.toISOString(),
  clientUpdatedAt: clientUpdatedAt.toISOString(),
});

/** `existingFoodIds` keeps item → food links valid: an unknown food id (e.g. a custom food that was
 *  rejected) is stored as null rather than failing the whole meal. */
export function mealsService(repo: MealsRepository, existingFoodIds: (ids: string[]) => Promise<Set<string>>) {
  const syncMeal: EntityHandler = async (userId, op) => {
    const existing = await repo.findMeal(op.id);
    const guard = lwwGuard(
      userId,
      op,
      existing ? { ownerId: existing.userId, clientUpdatedAt: existing.clientUpdatedAt } : null,
    );
    if (guard) return guard;

    const at = new Date(op.clientUpdatedAt);
    if (op.action === "delete") {
      if (existing) await repo.softDeleteMeal(op.id, at);
      return { opId: op.opId, status: "applied" };
    }

    const parsed = parseOpData(MealLogData, op);
    if (!parsed.ok) return parsed.result;
    const known = await existingFoodIds(parsed.data.items.flatMap((i) => (i.foodId ? [i.foodId] : [])));
    const items = parsed.data.items.map((i) => ({ ...i, foodId: i.foodId && known.has(i.foodId) ? i.foodId : null }));
    await repo.upsertMeal({ ...parsed.data, items, id: op.id, userId, clientUpdatedAt: at });
    return { opId: op.opId, status: "applied" };
  };

  return {
    syncMeal,

    async listForDay(userId: string, localDate: string): Promise<MealLogDto[]> {
      if (!(await repo.userExists(userId))) throw notFound("User");
      return (await repo.listMeals(userId, localDate)).map(toDto);
    },
  };
}

export type MealsService = ReturnType<typeof mealsService>;
