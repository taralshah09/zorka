// POST /v1/users/:id/brief/parse → DayFacts for the brief chips (LA2). Nothing is saved.
import { Router, type Request, type Response } from "express";

import { parse } from "../../http/validate.js";
import { UserIdParams } from "../users/users.schemas.js";
import { BriefParseBody } from "./briefs.schemas.js";
import type { BriefsService } from "./briefs.service.js";

/** Voice briefs carry base64 audio, so this path gets the larger JSON limit. */
export const BRIEF_LARGE_BODY_PATH = /^\/v1\/users\/[^/]+\/brief\/parse$/;

export function briefsRoutes(service: BriefsService): Router {
  return Router().post("/users/:id/brief/parse", async (req: Request, res: Response) => {
    const { id } = parse(UserIdParams, req.params);
    res.json(await service.parse(id, parse(BriefParseBody, req.body ?? {})));
  });
}
