// Express app factory. Dependencies are injected so tests can run without a database.
import express from "express";
import { pinoHttp } from "pino-http";
import type { Logger } from "pino";

import { errorHandler, notFoundHandler } from "./http/errors.js";
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
};

export function createApp({ logger, pingDb, users, sync }: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/v1/health" } }));
  app.use(express.json({ limit: "256kb" }));

  app.get("/", (_req, res) => {
    res.json({ name: "kimbo-api", status: "ok" });
  });

  const v1 = express.Router();
  v1.use(healthRoutes(pingDb));
  v1.use(usersRoutes(users));
  v1.use(syncRoutes(sync));
  app.use("/v1", v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
