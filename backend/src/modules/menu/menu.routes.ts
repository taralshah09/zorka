// POST /v1/users/:id/menu/read → the dishes on one menu page (LA7). Nothing is saved; the image is not kept.
import { Router, type Request, type Response } from "express";

import { parse } from "../../http/validate.js";
import { UserIdParams } from "../users/users.schemas.js";
import { MenuReadBody } from "./menu.schemas.js";
import type { MenuService } from "./menu.service.js";

/** Menu photos arrive as base64 JSON, so this path gets the larger JSON limit. */
export const MENU_LARGE_BODY_PATH = /^\/v1\/users\/[^/]+\/menu\/read$/;

export function menuRoutes(service: MenuService): Router {
  return Router().post("/users/:id/menu/read", async (req: Request, res: Response) => {
    const { id } = parse(UserIdParams, req.params);
    res.json(await service.read(id, parse(MenuReadBody, req.body ?? {})));
  });
}
