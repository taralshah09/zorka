// Persistence for foods. The curated catalog is shared; user-created foods (P13) are visible only to
// their owner and are soft-deleted.
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { FoodUnit } from "../../../../shared/domain/food.js";
import type { FoodDto } from "./foods.schemas.js";

export type FoodRecord = Omit<FoodDto, "updatedAt"> & {
  ownerUserId: string | null;
  clientUpdatedAt: Date | null;
  deletedAt: Date | null;
  updatedAt: Date;
};

export type CustomFoodWrite = {
  id: string;
  ownerUserId: string;
  name: string;
  diet: FoodDto["diet"];
  category: FoodDto["category"];
  homeCooked: boolean;
  liquid: boolean;
  per100g: FoodDto["per100g"];
  defaultUnit: FoodUnit;
  units: { unit: FoodUnit; grams: number }[];
  clientUpdatedAt: Date;
};

export interface FoodsRepository {
  userExists(userId: string): Promise<boolean>;
  /** Curated foods plus the user's own (not deleted). `userId` null = curated only. */
  listCatalog(userId: string | null): Promise<FoodRecord[]>;
  findFood(id: string): Promise<FoodRecord | null>;
  /** Ids from `ids` that exist (deleted or not). Used to keep meal items' food links valid. */
  existingIds(ids: string[]): Promise<Set<string>>;
  upsertCustomFood(food: CustomFoodWrite): Promise<void>;
  softDeleteCustomFood(id: string, clientUpdatedAt: Date): Promise<void>;
}

const include = { units: { orderBy: { grams: "asc" as const } } };

type Row = Awaited<ReturnType<PrismaClient["food"]["findFirstOrThrow"]>> & {
  units: { unit: FoodUnit; grams: number; label: string | null }[];
};

function toRecord(r: Row): FoodRecord {
  // Default unit first, then the rest smallest → largest, with g/ml last.
  const units = [...r.units].sort((a, b) => {
    const rank = (u: { unit: FoodUnit; grams: number }) =>
      u.unit === r.defaultUnit ? -1 : u.unit === "g" || u.unit === "ml" ? 1e9 : u.grams;
    return rank(a) - rank(b);
  });
  return {
    id: r.id,
    name: r.name,
    aliases: r.aliases,
    cuisine: r.cuisine,
    category: r.category,
    diet: r.diet,
    homeCooked: r.homeCooked,
    liquid: r.liquid,
    per100g: { kcal: r.kcalPer100g, proteinG: r.proteinPer100g, carbsG: r.carbsPer100g, fatG: r.fatPer100g },
    defaultUnit: r.defaultUnit,
    units,
    source: r.source,
    custom: r.ownerUserId !== null,
    ownerUserId: r.ownerUserId,
    clientUpdatedAt: r.clientUpdatedAt,
    deletedAt: r.deletedAt,
    updatedAt: r.updatedAt,
  };
}

export function prismaFoodsRepository(prisma: PrismaClient): FoodsRepository {
  return {
    userExists: async (userId) => (await prisma.user.count({ where: { id: userId } })) > 0,

    listCatalog: async (userId) => {
      const rows = await prisma.food.findMany({
        where: {
          deletedAt: null,
          OR: userId ? [{ ownerUserId: null }, { ownerUserId: userId }] : [{ ownerUserId: null }],
        },
        include,
        orderBy: { name: "asc" },
      });
      return rows.map(toRecord);
    },

    findFood: async (id) => {
      const row = await prisma.food.findUnique({ where: { id }, include });
      return row ? toRecord(row) : null;
    },

    existingIds: async (ids) => {
      if (!ids.length) return new Set();
      const rows = await prisma.food.findMany({ where: { id: { in: ids } }, select: { id: true } });
      return new Set(rows.map((r) => r.id));
    },

    upsertCustomFood: async (f) => {
      const data = {
        name: f.name,
        diet: f.diet,
        category: f.category,
        homeCooked: f.homeCooked,
        liquid: f.liquid,
        kcalPer100g: f.per100g.kcal,
        proteinPer100g: f.per100g.proteinG,
        carbsPer100g: f.per100g.carbsG,
        fatPer100g: f.per100g.fatG,
        defaultUnit: f.defaultUnit,
        clientUpdatedAt: f.clientUpdatedAt,
        deletedAt: null,
      };
      await prisma.$transaction([
        prisma.food.upsert({
          where: { id: f.id },
          create: { id: f.id, slug: `user-${f.id}`, ownerUserId: f.ownerUserId, source: "user", cuisine: "other", ...data },
          update: data,
        }),
        prisma.foodUnitOption.deleteMany({ where: { foodId: f.id } }),
        prisma.foodUnitOption.createMany({ data: f.units.map((u) => ({ foodId: f.id, ...u })) }),
      ]);
    },

    softDeleteCustomFood: async (id, clientUpdatedAt) => {
      await prisma.food.update({ where: { id }, data: { deletedAt: clientUpdatedAt, clientUpdatedAt } });
    },
  };
}
