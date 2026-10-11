// POST /v1/users/:id/coach/chat → the coach's reply (P35, D60). Nothing is saved; chat history stays on the phone (D58).
import { Router, type Request, type Response } from "express";

import { parse } from "../../http/validate.js";
import { UserIdParams } from "../users/users.schemas.js";
import { CoachChatBody } from "./coach.schemas.js";
import type { CoachService } from "./coach.service.js";

export function coachRoutes(service: CoachService): Router {
  return Router().post("/users/:id/coach/chat", async (req: Request, res: Response) => {
    const { id } = parse(UserIdParams, req.params);
    res.json(await service.chat(id, parse(CoachChatBody, req.body ?? {})));
  });
}
