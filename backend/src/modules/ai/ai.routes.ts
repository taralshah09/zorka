// /v1/dev/ai — dev-only (never mounted in production). P14 "done when": a model answers, and rate
// limits or timeouts come back as clean { error: { code, message } } responses.
//   GET  /v1/dev/ai/status   which slots exist (no keys), their models, calls, failures and cooldowns
//   POST /v1/dev/ai/chat     { "prompt": "…" } → { text, meta }
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { parse } from "../../http/validate.js";
import type { AiClient } from "./ai.client.js";

const ChatBody = z.object({ prompt: z.string().trim().min(1).max(2000), system: z.string().max(2000).optional() }).strict();

export function aiDevRoutes(ai: AiClient): Router {
  return Router()
    .get("/dev/ai/status", (_req: Request, res: Response) => {
      res.json(ai.status());
    })
    .post("/dev/ai/chat", async (req: Request, res: Response) => {
      const { prompt, system } = parse(ChatBody, req.body ?? {});
      res.json(await ai.chat({ system, user: prompt }));
    });
}
