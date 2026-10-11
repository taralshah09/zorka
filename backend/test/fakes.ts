// In-memory repositories + a test app. No database needed.
import { pino } from "pino";

import { FOOD_SOURCE, FOODS } from "../prisma/data/foods.js";
import { createApp } from "../src/app.js";
import { createAiClient, type AiClient } from "../src/modules/ai/ai.client.js";
import type { AiSlot } from "../src/modules/ai/ai.config.js";
import type { Fetch } from "../src/modules/ai/providers.js";
import { foodsFromRows } from "../src/modules/foods/catalog.js";
import type { FoodRecord, FoodsRepository } from "../src/modules/foods/foods.repository.js";
import { foodsService } from "../src/modules/foods/foods.service.js";
import { parseService } from "../src/modules/mealParse/parse.service.js";
import type { MealRecord, MealsRepository } from "../src/modules/meals/meals.repository.js";
import { mealsService } from "../src/modules/meals/meals.service.js";
import type { SyncRepository, ProbeRecord } from "../src/modules/sync/sync.repository.js";
import { syncService } from "../src/modules/sync/sync.service.js";
import type { UsersRepository, UserWithProfile } from "../src/modules/users/users.repository.js";
import { usersService } from "../src/modules/users/users.service.js";

export const RIYA = "6f1c2a3e-0b4d-4c7a-9e21-5a7b3c9d0e11";
export const ARJUN = "8a2d4b6f-1c3e-4d8b-8f32-6b8c4dae1f22";
export const UNKNOWN = "00000000-0000-4000-8000-000000000000";

export function memoryUsers(): UsersRepository & { rows: Map<string, UserWithProfile> } {
  const now = new Date("2026-10-11T00:00:00Z");
  const rows = new Map<string, UserWithProfile>(
    [
      [RIYA, "Riya"],
      [ARJUN, "Arjun"],
    ].map(([id, displayName]) => [id!, { id: id!, displayName: displayName!, createdAt: now, updatedAt: now, profile: null }]),
  );
  return {
    rows,
    list: async () => [...rows.values()],
    findById: async (id) => rows.get(id) ?? null,
    upsertProfile: async (userId, data) => {
      const user = rows.get(userId)!;
      const base = user.profile ?? {
        userId,
        goal: null,
        age: null,
        sex: null,
        heightCm: null,
        weightKg: null,
        activityLevel: null,
        diet: null,
        targetWeightKg: null,
        pace: null,
        coach: null,
        oilGheePrompt: false,
        onboardedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      const { onboardedAt, ...rest } = data;
      const profile = {
        ...base,
        ...rest,
        ...(onboardedAt !== undefined ? { onboardedAt: onboardedAt ? new Date(onboardedAt) : null } : null),
        updatedAt: new Date(),
      };
      rows.set(userId, { ...user, profile });
      return profile;
    },
  };
}

export function memorySync(userIds: string[]): SyncRepository & { probes: Map<string, ProbeRecord> } {
  const probes = new Map<string, ProbeRecord>();
  return {
    probes,
    userExists: async (id) => userIds.includes(id),
    findProbe: async (id) => probes.get(id) ?? null,
    upsertProbe: async (r) => {
      probes.set(r.id, { ...r, deletedAt: null });
    },
    softDeleteProbe: async (id, at) => {
      const p = probes.get(id);
      if (p) probes.set(id, { ...p, deletedAt: at, clientUpdatedAt: at });
    },
    listProbes: async (userId) => [...probes.values()].filter((p) => p.userId === userId && !p.deletedAt),
  };
}

const T0 = new Date("2026-10-11T00:00:00Z");

/** The real curated catalog, in memory, plus user-created foods. */
export function memoryFoods(userIds: string[]): FoodsRepository & { rows: Map<string, FoodRecord> } {
  const rows = new Map<string, FoodRecord>(
    foodsFromRows(FOODS).map((f) => [
      f.id,
      {
        id: f.id,
        name: f.name,
        aliases: f.aliases,
        cuisine: f.cuisine,
        category: f.category,
        diet: f.diet,
        homeCooked: f.homeCooked,
        liquid: f.liquid,
        per100g: { kcal: f.kcalPer100g, proteinG: f.proteinPer100g, carbsG: f.carbsPer100g, fatG: f.fatPer100g },
        defaultUnit: f.defaultUnit,
        units: f.units.map((u) => ({ ...u, label: null })),
        source: FOOD_SOURCE,
        custom: false,
        ownerUserId: null,
        clientUpdatedAt: null,
        deletedAt: null,
        updatedAt: T0,
      },
    ]),
  );
  return {
    rows,
    userExists: async (id) => userIds.includes(id),
    listCatalog: async (userId) =>
      [...rows.values()].filter((f) => !f.deletedAt && (f.ownerUserId === null || f.ownerUserId === userId)),
    findFood: async (id) => rows.get(id) ?? null,
    existingIds: async (ids) => new Set(ids.filter((id) => rows.has(id))),
    upsertCustomFood: async (f) => {
      rows.set(f.id, {
        id: f.id,
        name: f.name,
        aliases: [],
        cuisine: "other",
        category: f.category,
        diet: f.diet,
        homeCooked: f.homeCooked,
        liquid: f.liquid,
        per100g: f.per100g,
        defaultUnit: f.defaultUnit,
        units: f.units.map((u) => ({ ...u, label: null })),
        source: "user",
        custom: true,
        ownerUserId: f.ownerUserId,
        clientUpdatedAt: f.clientUpdatedAt,
        deletedAt: null,
        updatedAt: new Date(),
      });
    },
    softDeleteCustomFood: async (id, at) => {
      const f = rows.get(id);
      if (f) rows.set(id, { ...f, deletedAt: at, clientUpdatedAt: at });
    },
  };
}

export function memoryMeals(userIds: string[]): MealsRepository & { rows: Map<string, MealRecord> } {
  const rows = new Map<string, MealRecord>();
  return {
    rows,
    userExists: async (id) => userIds.includes(id),
    findMeal: async (id) => rows.get(id) ?? null,
    upsertMeal: async ({ id, userId, clientUpdatedAt, loggedAt, ...m }) => {
      rows.set(id, { ...m, id, userId, clientUpdatedAt, loggedAt: new Date(loggedAt), deletedAt: null });
    },
    softDeleteMeal: async (id, at) => {
      const m = rows.get(id);
      if (m) rows.set(id, { ...m, deletedAt: at, clientUpdatedAt: at });
    },
    listMeals: async (userId, localDate) =>
      [...rows.values()]
        .filter((m) => m.userId === userId && m.localDate === localDate && !m.deletedAt)
        .sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime()),
  };
}

/** An AI client whose network is `fetchImpl` (default: no slots configured). */
export function fakeAi(slots: AiSlot[] = [], fetchImpl?: Fetch, now?: () => number): AiClient {
  return createAiClient({ slots, logger: pino({ level: "silent" }), fetchImpl, now });
}

export function testApp(opts: { dbUp?: boolean; ai?: AiClient } = {}) {
  const ids = [RIYA, ARJUN];
  const users = memoryUsers();
  const sync = memorySync(ids);
  const foodsRepo = memoryFoods(ids);
  const mealsRepo = memoryMeals(ids);
  const foods = foodsService(foodsRepo);
  const meals = mealsService(mealsRepo, foods.existingIds);
  const ai = opts.ai ?? fakeAi();
  const app = createApp({
    logger: pino({ level: "silent" }),
    pingDb: async () => {
      if (opts.dbUp === false) throw new Error("db down");
    },
    users: usersService(users),
    sync: syncService(sync, { meal_log: meals.syncMeal, custom_food: foods.syncCustomFood }),
    foods,
    meals,
    parse: parseService(ai, foods, foodsRepo.userExists),
    ai,
    devRoutes: true,
  });
  return { app, users, sync, foods: foodsRepo, meals: mealsRepo };
}
