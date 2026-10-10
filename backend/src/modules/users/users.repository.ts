// Data access for users and profiles (Prisma). Services depend on the interface so tests can
// swap in an in-memory implementation.
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { Profile, User } from "../../generated/prisma/client.js";
import type { ProfileUpdate } from "./users.schemas.js";

export type UserWithProfile = User & { profile: Profile | null };

export interface UsersRepository {
  list(): Promise<UserWithProfile[]>;
  findById(id: string): Promise<UserWithProfile | null>;
  upsertProfile(userId: string, data: ProfileUpdate): Promise<Profile>;
}

export function prismaUsersRepository(prisma: PrismaClient): UsersRepository {
  return {
    list: () => prisma.user.findMany({ include: { profile: true }, orderBy: { createdAt: "asc" } }),

    findById: (id) => prisma.user.findUnique({ where: { id }, include: { profile: true } }),

    upsertProfile: (userId, data) => {
      const fields = {
        ...data,
        onboardedAt: data.onboardedAt === undefined ? undefined : data.onboardedAt && new Date(data.onboardedAt),
      };
      return prisma.profile.upsert({
        where: { userId },
        create: { userId, ...fields },
        update: fields,
      });
    },
  };
}
