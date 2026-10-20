// AB2 · POST /v1/users/:id/assistant/turn → what Zorka heard, the checked actions with their tiers, and a reply. Nothing
// is saved: the phone checks every action again and runs it (D96). The user id comes from the URL only; no action
// carries one (Guardrails 5).
import { Router, type Request, type Response } from "express";

import { parse } from "../../http/validate.js";
import { UserIdParams } from "../users/users.schemas.js";
import { AssistantTurnBody } from "./assistant.schemas.js";
import type { AssistantService } from "./assistant.service.js";

/** Voice turns carry base64 audio, so this path gets the larger JSON limit (like meals/parse-voice). */
export const ASSISTANT_LARGE_BODY_PATH = /^\/v1\/users\/[^/]+\/assistant\/turn$/;

export function assistantRoutes(service: AssistantService): Router {
  return Router().post("/users/:id/assistant/turn", async (req: Request, res: Response) => {
    const { id } = parse(UserIdParams, req.params);
    res.json(await service.turn(id, parse(AssistantTurnBody, req.body ?? {})));
  });
}
