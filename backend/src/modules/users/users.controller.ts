// HTTP layer for users: parse + validate the request, call the service, shape the response.
import type { Request, Response } from "express";

import { parse } from "../../http/validate.js";
import { ProfileUpdateBody, UserIdParams } from "./users.schemas.js";
import type { UsersService } from "./users.service.js";

export function usersController(service: UsersService) {
  return {
    list: async (_req: Request, res: Response) => {
      res.json({ users: await service.listUsers() });
    },

    getProfile: async (req: Request, res: Response) => {
      const { id } = parse(UserIdParams, req.params);
      res.json({ profile: await service.getProfile(id) });
    },

    updateProfile: async (req: Request, res: Response) => {
      const { id } = parse(UserIdParams, req.params);
      const body = parse(ProfileUpdateBody, req.body ?? {});
      res.json({ profile: await service.updateProfile(id, body) });
    },
  };
}
