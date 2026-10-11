// Express app factory. Dependencies are injected so tests can run without a database.
import express from "express";
import { pinoHttp } from "pino-http";
import type { Logger } from "pino";

import { errorHandler, notFoundHandler } from "./http/errors.js";
import type { AiClient } from "./modules/ai/ai.client.js";
import { aiDevRoutes } from "./modules/ai/ai.routes.js";
import { foodsRoutes } from "./modules/foods/foods.routes.js";
import type { FoodsService } from "./modules/foods/foods.service.js";
import { LARGE_BODY_PATHS, parseRoutes } from "./modules/mealParse/parse.routes.js";
import type { ParseService } from "./modules/mealParse/parse.service.js";
import { mealsRoutes } from "./modules/meals/meals.routes.js";
import type { MealsService } from "./modules/meals/meals.service.js";
import { healthRoutes, type DbPing } from "./modules/health/health.routes.js";
import type { SyncService } from "./modules/sync/sync.service.js";
import { syncRoutes } from "./modules/sync/sync.routes.js";
import type { UsersService } from "./modules/users/users.service.js";
import { usersRoutes } from "./modules/users/users.routes.js";

export type AppDeps = {
  logger: Logger;
  pingDb: DbPing;
  users: UsersService;
  sync: SyncService;
  foods: FoodsService;
  meals: MealsService;
  parse: ParseService;
  ai: AiClient;
  /** Mounts /v1/dev/* (never in production). */
  devRoutes: boolean;
};

const smallJson = express.json({ limit: "256kb" });
// Voice notes and meal photos arrive as base64 JSON (D32/D33), so those two paths get more room.
const largeJson = express.json({ limit: "6mb" });

export function createApp({ logger, pingDb, users, sync, foods, meals, parse, ai, devRoutes }: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/v1/health" } }));
  app.use((req, res, next) => (LARGE_BODY_PATHS.test(req.path) ? largeJson : smallJson)(req, res, next));

  app.get("/", (_req, res) => {
    res.json({ name: "kimbo-api", status: "ok" });
  });

  const v1 = express.Router();
  v1.use(healthRoutes(pingDb));
  v1.use(usersRoutes(users));
  v1.use(syncRoutes(sync));
  v1.use(foodsRoutes(foods));
  v1.use(mealsRoutes(meals));
  v1.use(parseRoutes(parse));
  if (devRoutes) v1.use(aiDevRoutes(ai));
  app.use("/v1", v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
