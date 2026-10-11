// /v1/users/:id/workouts?limit= — the user's most recent workouts. Writes arrive through POST /sync.
import { Router, type Request, type Response } from "express";

import { parse } from "../../http/validate.js";
import { UserIdParams } from "../users/users.schemas.js";
import { WorkoutsQuery } from "./workouts.schemas.js";
import type { WorkoutsService } from "./workouts.service.js";

export function workoutsRoutes(service: WorkoutsService): Router {
  return Router().get("/users/:id/workouts", async (req: Request, res: Response) => {
    const { id } = parse(UserIdParams, req.params);
    const { limit } = parse(WorkoutsQuery, req.query);
    res.json({ workouts: await service.listRecent(id, limit) });
  });
}
