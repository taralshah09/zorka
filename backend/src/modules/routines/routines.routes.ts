// /v1/users/:id/routines — the user's routines. Writes arrive through POST /sync (entity "routine").
import { Router, type Request, type Response } from "express";

import { parse } from "../../http/validate.js";
import { UserIdParams } from "../users/users.schemas.js";
import type { RoutinesService } from "./routines.service.js";

export function routinesRoutes(service: RoutinesService): Router {
  return Router().get("/users/:id/routines", async (req: Request, res: Response) => {
    const { id } = parse(UserIdParams, req.params);
    res.json({ routines: await service.list(id) });
  });
}
