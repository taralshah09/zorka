// /v1/users/:id/sync — outbox push. /v1/users/:id/sync-probes — dev check for the P07 test record.
import { Router } from "express";

import { syncController } from "./sync.controller.js";
import type { SyncService } from "./sync.service.js";

export function syncRoutes(service: SyncService): Router {
  const c = syncController(service);
  return Router().post("/users/:id/sync", c.push).get("/users/:id/sync-probes", c.listProbes);
}
