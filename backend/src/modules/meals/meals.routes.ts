// /v1/users/:id/meals?date=YYYY-MM-DD — the user's meals for one local day.
import { Router } from "express";

import { mealsController } from "./meals.controller.js";
import type { MealsService } from "./meals.service.js";

export function mealsRoutes(service: MealsService): Router {
  const c = mealsController(service);
  return Router().get("/users/:id/meals", c.listForDay);
}
