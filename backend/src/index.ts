import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { memoryRateLimitStore } from "./http/rateLimit.js";
import { createLogger } from "./lib/logger.js";
import { disconnectPrisma, getPrisma } from "./lib/prisma.js";
import { prismaActivitiesRepository } from "./modules/activities/activities.repository.js";
import { activitiesService } from "./modules/activities/activities.service.js";
import { prismaCheckinsRepository } from "./modules/checkins/checkins.repository.js";
import { checkinsService } from "./modules/checkins/checkins.service.js";
import { createAiClient } from "./modules/ai/ai.client.js";
import { aiSlotsFromEnv } from "./modules/ai/ai.config.js";
import { coachService } from "./modules/coach/coach.service.js";
import { prismaExercisesRepository } from "./modules/exercises/exercises.repository.js";
import { exercisesService } from "./modules/exercises/exercises.service.js";
import { foodLookupService } from "./modules/foodLookup/lookup.service.js";
import { prismaFoodsRepository } from "./modules/foods/foods.repository.js";
import { foodsService } from "./modules/foods/foods.service.js";
import { gymParseService } from "./modules/gymParse/gymParse.service.js";
import { parseService } from "./modules/mealParse/parse.service.js";
import { prismaMealsRepository } from "./modules/meals/meals.repository.js";
import { mealsService } from "./modules/meals/meals.service.js";
import { nearbyService } from "./modules/nearby/nearby.service.js";
import { createSearchClient } from "./modules/nearby/search.client.js";
import { prismaPhasesRepository } from "./modules/phases/phases.repository.js";
import { phasesService } from "./modules/phases/phases.service.js";
import { prismaRoutinesRepository } from "./modules/routines/routines.repository.js";
import { routinesService } from "./modules/routines/routines.service.js";
import { changesService } from "./modules/sync/changes.js";
import { prismaSyncRepository } from "./modules/sync/sync.repository.js";
import { syncService } from "./modules/sync/sync.service.js";
import { prismaUsersRepository } from "./modules/users/users.repository.js";
import { usersService } from "./modules/users/users.service.js";
import { prismaWeightsRepository } from "./modules/weights/weights.repository.js";
import { weightsService } from "./modules/weights/weights.service.js";
import { prismaWaterRepository } from "./modules/water/water.repository.js";
import { waterService } from "./modules/water/water.service.js";
import { prismaWorkoutsRepository } from "./modules/workouts/workouts.repository.js";
import { workoutsService } from "./modules/workouts/workouts.service.js";

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === "development");
const prisma = getPrisma(env.DATABASE_URL, env.DB_POOL_MAX);

const foodsRepo = prismaFoodsRepository(prisma);
const foods = foodsService(foodsRepo);
const meals = mealsService(prismaMealsRepository(prisma), foods.existingIds);
const exercisesRepo = prismaExercisesRepository(prisma);
const exercises = exercisesService(exercisesRepo);
const routines = routinesService(prismaRoutinesRepository(prisma), exercises.existingIds);
const workouts = workoutsService(prismaWorkoutsRepository(prisma), exercises.existingIds, routines.existingIds);
const activities = activitiesService(prismaActivitiesRepository(prisma));
const weights = weightsService(prismaWeightsRepository(prisma));
const water = waterService(prismaWaterRepository(prisma));
const checkins = checkinsService(prismaCheckinsRepository(prisma));
const phases = phasesService(prismaPhasesRepository(prisma));
const syncRepo = prismaSyncRepository(prisma);
const aiSlots = aiSlotsFromEnv(env);
const ai = createAiClient({ slots: aiSlots, logger });
const search = createSearchClient({
  keys: { tavily: env.TAVILY_API_KEY, firecrawl: env.FIRECRAWL_API_KEY, anakin: env.ANAKIN_API_KEY },
  order: env.SEARCH_PROVIDER_ORDER,
  logger,
});

const app = createApp({
  logger,
  pingDb: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
  users: usersService(prismaUsersRepository(prisma)),
  sync: syncService(syncRepo, {
    meal_log: meals.syncMeal,
    custom_food: foods.syncCustomFood,
    custom_exercise: exercises.syncCustomExercise,
    workout: workouts.syncWorkout,
    routine: routines.syncRoutine,
    activity: activities.syncActivity,
    weight_log: weights.syncWeight,
    water_log: water.syncWater,
    checkin: checkins.syncCheckin,
    phase: phases.syncPhase,
  }),
  changes: changesService(syncRepo.userExists, {
    meal_log: meals.changes,
    workout: workouts.changes,
    routine: routines.changes,
    activity: activities.changes,
    weight_log: weights.changes,
    water_log: water.changes,
    checkin: checkins.changes,
    phase: phases.changes,
  }),
  foods,
  foodLookup: foodLookupService(ai, search, foodsRepo.userExists),
  meals,
  parse: parseService(ai, foods, foodsRepo.userExists),
  exercises,
  workouts,
  routines,
  gymParse: gymParseService(ai, exercises, exercisesRepo.userExists),
  nearby: nearbyService(ai, search, foodsRepo.userExists),
  coach: coachService(ai, foodsRepo.userExists),
  ai,
  search,
  devRoutes: env.NODE_ENV !== "production",
  trustProxy: env.TRUST_PROXY,
  rateLimit: env.RATE_LIMIT_ENABLED
    ? {
        store: memoryRateLimitStore(),
        config: {
          general: { perMinutePerUser: env.RATE_LIMIT_PER_MIN_USER, perMinutePerIp: env.RATE_LIMIT_PER_MIN_IP },
          ai: { perMinute: env.RATE_LIMIT_AI_PER_MIN, perDay: env.RATE_LIMIT_AI_PER_DAY },
          search: { perMinute: env.RATE_LIMIT_SEARCH_PER_MIN, perDay: env.RATE_LIMIT_SEARCH_PER_DAY },
        },
      }
    : undefined,
});

const server = app.listen(env.PORT, () => {
  logger.info(`zorka-api listening on http://localhost:${env.PORT}`);
  // Slot ids only (e.g. "groq#1"), never keys.
  logger.info({ aiSlots: aiSlots.map((s) => s.id) }, aiSlots.length ? "AI slots ready" : "No AI keys set: AI logging is off");
  // Service names only, never keys.
  const searchReady = search.status().configured;
  logger.info({ search: searchReady }, searchReady.length ? "Search ready" : "No search keys set: nearby options and food lookup are off");
  logger.info(env.RATE_LIMIT_ENABLED ? "Rate limits on" : "Rate limits OFF (RATE_LIMIT_ENABLED=false)");
});

const shutdown = (signal: string) => {
  logger.info({ signal }, "Shutting down");
  server.close(() => {
    disconnectPrisma().finally(() => process.exit(0));
  });
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
