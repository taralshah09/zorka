// POST /v1/users/:id/plan/week → the model's proposal for the rest of the week (D85). Nothing is saved.
import { Router, type Request, type Response } from "express";

import { parse } from "../../http/validate.js";
import { UserIdParams } from "../users/users.schemas.js";
import { PlanWeekBody } from "./aiPlan.schemas.js";
import type { AiPlanService } from "./aiPlan.service.js";

export function aiPlanRoutes(service: AiPlanService): Router {
  return Router().post("/users/:id/plan/week", async (req: Request, res: Response) => {
    const { id } = parse(UserIdParams, req.params);
    res.json(await service.planWeek(id, parse(PlanWeekBody, req.body ?? {})));
  });
}
