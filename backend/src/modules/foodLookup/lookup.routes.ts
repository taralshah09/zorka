// POST /v1/users/:id/foods/lookup → web-sourced nutrition for a food the catalog doesn't have. Nothing is saved.
import { Router, type Request, type Response } from "express";

import { parse } from "../../http/validate.js";
import { UserIdParams } from "../users/users.schemas.js";
import { LookupBody } from "./lookup.schemas.js";
import type { FoodLookupService } from "./lookup.service.js";

export function foodLookupRoutes(service: FoodLookupService): Router {
  return Router().post("/users/:id/foods/lookup", async (req: Request, res: Response) => {
    const { id } = parse(UserIdParams, req.params);
    const { name } = parse(LookupBody, req.body ?? {});
    res.json(await service.lookup(id, name));
  });
}
