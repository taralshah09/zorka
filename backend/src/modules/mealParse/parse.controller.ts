// HTTP layer for meal parsing (P15–P17). Large bodies (voice, photo) get their own JSON limit in app.ts.
import type { Request, Response } from "express";

import { parse } from "../../http/validate.js";
import { UserIdParams } from "../users/users.schemas.js";
import { PhotoParseBody, TextParseBody, VoiceParseBody } from "./parse.schemas.js";
import type { ParseService } from "./parse.service.js";

export function parseController(service: ParseService) {
  return {
    text: async (req: Request, res: Response) => {
      const { id } = parse(UserIdParams, req.params);
      const { text } = parse(TextParseBody, req.body ?? {});
      res.json(await service.parseText(id, text));
    },

    voice: async (req: Request, res: Response) => {
      const { id } = parse(UserIdParams, req.params);
      const { audioBase64, mimeType } = parse(VoiceParseBody, req.body ?? {});
      res.json(await service.parseVoice(id, { base64: audioBase64, mimeType }));
    },

    photo: async (req: Request, res: Response) => {
      const { id } = parse(UserIdParams, req.params);
      const { imageBase64, mimeType } = parse(PhotoParseBody, req.body ?? {});
      res.json(await service.parsePhoto(id, { base64: imageBase64, mimeType }));
    },
  };
}
