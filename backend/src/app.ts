// Express app factory. Dependencies are injected so tests can run without a database.
import express from "express";
import { pinoHttp } from "pino-http";
import type { Logger } from "pino";

import { errorHandler, notFoundHandler } from "./http/errors.js";
import type { AiClient } from "./modules/ai/ai.client.js";
import { aiDevRoutes } from "./modules/ai/ai.routes.js";
import { exercisesRoutes } from "./modules/exercises/exercises.routes.js";
import type { ExercisesService } from "./modules/exercises/exercises.service.js";
import { foodsRoutes } from "./modules/foods/foods.routes.js";
import type { FoodsService } from "./modules/foods/foods.service.js";
import { LARGE_BODY_PATHS, parseRoutes } from "./modules/mealParse/parse.routes.js";
import type { ParseService } from "./modules/mealParse/parse.service.js";
import { mealsRoutes } from "./modules/meals/meals.routes.js";
import type { MealsService } from "./modules/meals/meals.service.js";
import { GYM_LARGE_BODY_PATH, gymParseRoutes } from "./modules/gymParse/gymParse.routes.js";
import type { GymParseService } from "./modules/gymParse/gymParse.service.js";
import { healthRoutes, type DbPing } from "./modules/health/health.routes.js";
import { routinesRoutes } from "./modules/routines/routines.routes.js";
import type { RoutinesService } from "./modules/routines/routines.service.js";
import type { SyncService } from "./modules/sync/sync.service.js";
import { changesRoutes, type ChangesService } from "./modules/sync/changes.js";
import { syncRoutes } from "./modules/sync/sync.routes.js";
import type { UsersService } from "./modules/users/users.service.js";
import { usersRoutes } from "./modules/users/users.routes.js";
import { workoutsRoutes } from "./modules/workouts/workouts.routes.js";
import type { WorkoutsService } from "./modules/workouts/workouts.service.js";

export type AppDeps = {
  logger: Logger;
  pingDb: DbPing;
  users: UsersService;
  sync: SyncService;
  changes: ChangesService;
  foods: FoodsService;
  meals: MealsService;
  parse: ParseService;
  exercises: ExercisesService;
  workouts: WorkoutsService;
  routines: RoutinesService;
  gymParse: GymParseService;
  ai: AiClient;
  /** Mounts /v1/dev/* (never in production). */
  devRoutes: boolean;
};

const smallJson = express.json({ limit: "256kb" });
// Voice notes and meal photos arrive as base64 JSON (D32/D33), so those paths (and gym voice, P22) get more room.
const largeJson = express.json({ limit: "6mb" });
// Sync batches can carry finished GPS activities with their whole route.
const syncJson = express.json({ limit: "20mb" });
const SYNC_PATH = /^\/v1\/users\/[^/]+\/sync$/;

export function createApp(deps: AppDeps) {
  const { logger, pingDb, users, sync, changes, foods, meals, parse, exercises, workouts, routines, gymParse, ai, devRoutes } =
    deps;
  const app = express();
  app.disable("x-powered-by");
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/v1/health" } }));
  app.use((req, res, next) =>
    (SYNC_PATH.test(req.path)
      ? syncJson
      : LARGE_BODY_PATHS.test(req.path) || GYM_LARGE_BODY_PATH.test(req.path)
        ? largeJson
        : smallJson)(req, res, next),
  );

  app.get("/", (_req, res) => {
    res.json({ name: "kimbo-api", status: "ok" });
  });

  const v1 = express.Router();
  v1.use(healthRoutes(pingDb));
  v1.use(usersRoutes(users));
  v1.use(syncRoutes(sync));
  v1.use(changesRoutes(changes));
  v1.use(foodsRoutes(foods));
  v1.use(mealsRoutes(meals));
  v1.use(parseRoutes(parse));
  v1.use(exercisesRoutes(exercises));
  v1.use(workoutsRoutes(workouts));
  v1.use(routinesRoutes(routines));
  v1.use(gymParseRoutes(gymParse));
  if (devRoutes) v1.use(aiDevRoutes(ai));
  app.use("/v1", v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
