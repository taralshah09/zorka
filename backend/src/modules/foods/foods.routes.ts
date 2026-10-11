// /v1/foods (curated catalog) and /v1/users/:id/foods (curated + the user's own foods).
import { Router } from "express";

import { foodsController } from "./foods.controller.js";
import type { FoodsService } from "./foods.service.js";

export function foodsRoutes(service: FoodsService): Router {
  const c = foodsController(service);
  return Router()
    .get("/foods", c.search)
    .get("/foods/:foodId", c.get)
    .get("/users/:id/foods", c.searchForUser)
    .get("/users/:id/foods/catalog", c.catalog);
}
