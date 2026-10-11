// POST /v1/users/:id/workouts/parse-voice → sets for the open workout (nothing is saved).
import { Router, type Request, type Response } from "express";

import { parse } from "../../http/validate.js";
import { UserIdParams } from "../users/users.schemas.js";
import { GymVoiceBody } from "./gymParse.schemas.js";
import type { GymParseService } from "./gymParse.service.js";

/** Carries base64 audio, so it gets the bigger JSON limit in app.ts. */
export const GYM_LARGE_BODY_PATH = /^\/v1\/users\/[^/]+\/workouts\/parse-voice$/;

export function gymParseRoutes(service: GymParseService): Router {
  return Router().post("/users/:id/workouts/parse-voice", async (req: Request, res: Response) => {
    const { id } = parse(UserIdParams, req.params);
    const { audioBase64, mimeType, preferExerciseIds } = parse(GymVoiceBody, req.body ?? {});
    res.json(await service.parseVoice(id, { base64: audioBase64, mimeType }, preferExerciseIds));
  });
}
