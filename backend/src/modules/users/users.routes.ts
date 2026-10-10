// /v1/users — routes → controller → service → repository.
import { Router } from "express";

import { usersController } from "./users.controller.js";
import type { UsersService } from "./users.service.js";

export function usersRoutes(service: UsersService): Router {
  const c = usersController(service);
  return Router()
    .get("/users", c.list)
    .get("/users/:id/profile", c.getProfile)
    .put("/users/:id/profile", c.updateProfile);
}
