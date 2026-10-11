// HTTP layer for meal logs. Writes arrive through POST /v1/users/:id/sync (entity "meal_log").
import type { Request, Response } from "express";

import { parse } from "../../http/validate.js";
import { UserIdParams } from "../users/users.schemas.js";
import { MealsQuery } from "./meals.schemas.js";
import type { MealsService } from "./meals.service.js";

export function mealsController(service: MealsService) {
  return {
    listForDay: async (req: Request, res: Response) => {
      const { id } = parse(UserIdParams, req.params);
      const { date } = parse(MealsQuery, req.query);
      res.json({ meals: await service.listForDay(id, date) });
    },
  };
}
