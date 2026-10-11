// Persistence for meal logs. An upsert replaces the meal's items in one transaction.
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { MealLogData, MealLogDto } from "./meals.schemas.js";

export type MealRecord = Omit<MealLogDto, "loggedAt" | "clientUpdatedAt"> & {
  userId: string;
  loggedAt: Date;
  clientUpdatedAt: Date;
  deletedAt: Date | null;
};

export interface MealsRepository {
  userExists(userId: string): Promise<boolean>;
  findMeal(id: string): Promise<MealRecord | null>;
  upsertMeal(meal: { id: string; userId: string; clientUpdatedAt: Date } & MealLogData): Promise<void>;
  softDeleteMeal(id: string, clientUpdatedAt: Date): Promise<void>;
  listMeals(userId: string, localDate: string): Promise<MealRecord[]>;
  /** Changed since `since` (inclusive), deleted ones included, oldest change first. */
  listChanged(userId: string, since: Date, limit: number): Promise<(MealRecord & { updatedAt: Date })[]>;
}

const include = { items: { orderBy: { position: "asc" as const } } };

type Row = NonNullable<Awaited<ReturnType<PrismaClient["mealLog"]["findFirst"]>>> & {
  items: Awaited<ReturnType<PrismaClient["mealItem"]["findMany"]>>;
};

const toRecord = (r: Row): MealRecord => ({
  id: r.id,
  userId: r.userId,
  mealType: r.mealType,
  loggedAt: r.loggedAt,
  localDate: r.localDate,
  source: r.source,
  oilLevel: r.oilLevel,
  clientUpdatedAt: r.clientUpdatedAt,
  deletedAt: r.deletedAt,
  items: r.items.map((i) => ({
    id: i.id,
    foodId: i.foodId,
    name: i.name,
    quantity: i.quantity,
    unit: i.unit,
    grams: i.grams,
    kcal: i.kcal,
    proteinG: i.proteinG,
    carbsG: i.carbsG,
    fatG: i.fatG,
  })),
});

export function prismaMealsRepository(prisma: PrismaClient): MealsRepository {
  return {
    userExists: async (userId) => (await prisma.user.count({ where: { id: userId } })) > 0,

    findMeal: async (id) => {
      const row = await prisma.mealLog.findUnique({ where: { id }, include });
      return row ? toRecord(row) : null;
    },

    upsertMeal: async ({ id, userId, clientUpdatedAt, items, loggedAt, ...meal }) => {
      const data = { ...meal, loggedAt: new Date(loggedAt), clientUpdatedAt, deletedAt: null };
      await prisma.$transaction([
        prisma.mealLog.upsert({ where: { id }, create: { id, userId, ...data }, update: data }),
        prisma.mealItem.deleteMany({ where: { mealLogId: id } }),
        prisma.mealItem.createMany({ data: items.map((item, position) => ({ ...item, mealLogId: id, position })) }),
      ]);
    },

    softDeleteMeal: async (id, clientUpdatedAt) => {
      await prisma.mealLog.update({ where: { id }, data: { deletedAt: clientUpdatedAt, clientUpdatedAt } });
    },

    listMeals: async (userId, localDate) =>
      (
        await prisma.mealLog.findMany({
          where: { userId, localDate, deletedAt: null },
          include,
          orderBy: { loggedAt: "asc" },
        })
      ).map(toRecord),

    listChanged: async (userId, since, limit) =>
      (
        await prisma.mealLog.findMany({
          where: { userId, updatedAt: { gte: since } },
          include,
          orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
          take: limit,
        })
      ).map((r) => ({ ...toRecord(r), updatedAt: r.updatedAt })),
  };
}
