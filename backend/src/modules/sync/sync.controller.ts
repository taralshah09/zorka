import type { Request, Response } from "express";

import { parse } from "../../http/validate.js";
import { UserIdParams } from "../users/users.schemas.js";
import { SyncBody } from "./sync.schemas.js";
import type { SyncService } from "./sync.service.js";

export function syncController(service: SyncService) {
  return {
    push: async (req: Request, res: Response) => {
      const { id } = parse(UserIdParams, req.params);
      const { ops } = parse(SyncBody, req.body ?? {});
      res.json({ results: await service.applyBatch(id, ops) });
    },

    listProbes: async (req: Request, res: Response) => {
      const { id } = parse(UserIdParams, req.params);
      res.json({ probes: await service.listProbes(id) });
    },
  };
}
