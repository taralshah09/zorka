// /v1/users/:id/exercises/catalog — curated exercises + the user's own, for the phone's offline cache.
import { Router, type Request, type Response } from "express";

import { parse } from "../../http/validate.js";
import { UserIdParams } from "../users/users.schemas.js";
import type { ExercisesService } from "./exercises.service.js";

export function exercisesRoutes(service: ExercisesService): Router {
  return Router().get("/users/:id/exercises/catalog", async (req: Request, res: Response) => {
    const { id } = parse(UserIdParams, req.params);
    res.json({ exercises: await service.catalog(id) });
  });
}
