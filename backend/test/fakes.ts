// In-memory repositories + a test app. No database needed.
import { pino } from "pino";

import { createApp } from "../src/app.js";
import type { SyncRepository, ProbeRecord } from "../src/modules/sync/sync.repository.js";
import { syncService } from "../src/modules/sync/sync.service.js";
import type { UsersRepository, UserWithProfile } from "../src/modules/users/users.repository.js";
import { usersService } from "../src/modules/users/users.service.js";

export const RIYA = "6f1c2a3e-0b4d-4c7a-9e21-5a7b3c9d0e11";
export const ARJUN = "8a2d4b6f-1c3e-4d8b-8f32-6b8c4dae1f22";
export const UNKNOWN = "00000000-0000-4000-8000-000000000000";

export function memoryUsers(): UsersRepository & { rows: Map<string, UserWithProfile> } {
  const now = new Date("2026-10-11T00:00:00Z");
  const rows = new Map<string, UserWithProfile>(
    [
      [RIYA, "Riya"],
      [ARJUN, "Arjun"],
    ].map(([id, displayName]) => [id!, { id: id!, displayName: displayName!, createdAt: now, updatedAt: now, profile: null }]),
  );
  return {
    rows,
    list: async () => [...rows.values()],
    findById: async (id) => rows.get(id) ?? null,
    upsertProfile: async (userId, data) => {
      const user = rows.get(userId)!;
      const base = user.profile ?? {
        userId,
        goal: null,
        age: null,
        sex: null,
        heightCm: null,
        weightKg: null,
        activityLevel: null,
        diet: null,
        targetWeightKg: null,
        pace: null,
        coach: null,
        onboardedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      const { onboardedAt, ...rest } = data;
      const profile = {
        ...base,
        ...rest,
        ...(onboardedAt !== undefined ? { onboardedAt: onboardedAt ? new Date(onboardedAt) : null } : null),
        updatedAt: new Date(),
      };
      rows.set(userId, { ...user, profile });
      return profile;
    },
  };
}

export function memorySync(userIds: string[]): SyncRepository & { probes: Map<string, ProbeRecord> } {
  const probes = new Map<string, ProbeRecord>();
  return {
    probes,
    userExists: async (id) => userIds.includes(id),
    findProbe: async (id) => probes.get(id) ?? null,
    upsertProbe: async (r) => {
      probes.set(r.id, { ...r, deletedAt: null });
    },
    softDeleteProbe: async (id, at) => {
      const p = probes.get(id);
      if (p) probes.set(id, { ...p, deletedAt: at, clientUpdatedAt: at });
    },
    listProbes: async (userId) => [...probes.values()].filter((p) => p.userId === userId && !p.deletedAt),
  };
}

export function testApp(opts: { dbUp?: boolean } = {}) {
  const users = memoryUsers();
  const sync = memorySync([RIYA, ARJUN]);
  const app = createApp({
    logger: pino({ level: "silent" }),
    pingDb: async () => {
      if (opts.dbUp === false) throw new Error("db down");
    },
    users: usersService(users),
    sync: syncService(sync),
  });
  return { app, users, sync };
}
