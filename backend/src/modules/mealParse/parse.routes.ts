// POST /v1/users/:id/meals/parse-{text,voice,photo} → items for the confirm sheet (nothing is saved).
import { Router } from "express";

import { parseController } from "./parse.controller.js";
import type { ParseService } from "./parse.service.js";

/** Paths that carry base64 audio or images and need a bigger JSON limit. */
export const LARGE_BODY_PATHS = /^\/v1\/users\/[^/]+\/meals\/parse-(voice|photo)$/;

export function parseRoutes(service: ParseService): Router {
  const c = parseController(service);
  return Router()
    .post("/users/:id/meals/parse-text", c.text)
    .post("/users/:id/meals/parse-voice", c.voice)
    .post("/users/:id/meals/parse-photo", c.photo);
}
