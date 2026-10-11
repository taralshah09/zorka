// HTTP layer for foods: parse + validate the request, call the service, shape the response.
import type { Request, Response } from "express";

import { parse } from "../../http/validate.js";
import { UserIdParams } from "../users/users.schemas.js";
import { FoodIdParams, FoodSearchQuery } from "./foods.schemas.js";
import type { FoodsService } from "./foods.service.js";

export function foodsController(service: FoodsService) {
  return {
    search: async (req: Request, res: Response) => {
      const { q, limit } = parse(FoodSearchQuery, req.query);
      res.json({ foods: await service.search(null, q, limit) });
    },

    get: async (req: Request, res: Response) => {
      const { foodId } = parse(FoodIdParams, req.params);
      res.json({ food: await service.get(foodId) });
    },

    searchForUser: async (req: Request, res: Response) => {
      const { id } = parse(UserIdParams, req.params);
      const { q, limit } = parse(FoodSearchQuery, req.query);
      res.json({ foods: await service.search(id, q, limit) });
    },

    catalog: async (req: Request, res: Response) => {
      const { id } = parse(UserIdParams, req.params);
      res.json({ foods: await service.catalog(id) });
    },
  };
}
