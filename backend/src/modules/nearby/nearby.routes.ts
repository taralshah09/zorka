// POST /v1/users/:id/nearby → nearby Zomato/Blinkit options for an area (P34, D59). Nothing is saved.
import { Router, type Request, type Response } from "express";

import { parse } from "../../http/validate.js";
import { UserIdParams } from "../users/users.schemas.js";
import { NearbyBody } from "./nearby.schemas.js";
import type { NearbyService } from "./nearby.service.js";

export function nearbyRoutes(service: NearbyService): Router {
  return Router().post("/users/:id/nearby", async (req: Request, res: Response) => {
    const { id } = parse(UserIdParams, req.params);
    const { area, diet } = parse(NearbyBody, req.body ?? {});
    res.json(await service.nearby(id, area, diet));
  });
}
