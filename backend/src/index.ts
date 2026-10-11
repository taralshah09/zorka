import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { disconnectPrisma, getPrisma } from "./lib/prisma.js";
import { createAiClient } from "./modules/ai/ai.client.js";
import { aiSlotsFromEnv } from "./modules/ai/ai.config.js";
import { prismaFoodsRepository } from "./modules/foods/foods.repository.js";
import { foodsService } from "./modules/foods/foods.service.js";
import { parseService } from "./modules/mealParse/parse.service.js";
import { prismaMealsRepository } from "./modules/meals/meals.repository.js";
import { mealsService } from "./modules/meals/meals.service.js";
import { prismaSyncRepository } from "./modules/sync/sync.repository.js";
import { syncService } from "./modules/sync/sync.service.js";
import { prismaUsersRepository } from "./modules/users/users.repository.js";
import { usersService } from "./modules/users/users.service.js";

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === "development");
const prisma = getPrisma(env.DATABASE_URL);

const foodsRepo = prismaFoodsRepository(prisma);
const foods = foodsService(foodsRepo);
const meals = mealsService(prismaMealsRepository(prisma), foods.existingIds);
const aiSlots = aiSlotsFromEnv(env);
const ai = createAiClient({ slots: aiSlots, logger });

const app = createApp({
  logger,
  pingDb: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
  users: usersService(prismaUsersRepository(prisma)),
  sync: syncService(prismaSyncRepository(prisma), { meal_log: meals.syncMeal, custom_food: foods.syncCustomFood }),
  foods,
  meals,
  parse: parseService(ai, foods, foodsRepo.userExists),
  ai,
  devRoutes: env.NODE_ENV !== "production",
});

const server = app.listen(env.PORT, () => {
  logger.info(`kimbo-api listening on http://localhost:${env.PORT}`);
  // Slot ids only (e.g. "groq#1"), never keys.
  logger.info({ aiSlots: aiSlots.map((s) => s.id) }, aiSlots.length ? "AI slots ready" : "No AI keys set: AI logging is off");
});

const shutdown = (signal: string) => {
  logger.info({ signal }, "Shutting down");
  server.close(() => {
    disconnectPrisma().finally(() => process.exit(0));
  });
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
