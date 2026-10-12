import { STEP_TARGET } from "../../../../shared/domain/targets.js";
import { WATER_GOAL_DEFAULT } from "../../../../shared/domain/water.js";
import { notFound } from "../../http/errors.js";
import type { UserWithProfile, UsersRepository } from "./users.repository.js";
import type { ProfileDto, ProfileUpdate, UserSummaryDto } from "./users.schemas.js";

function toProfileDto(user: UserWithProfile): ProfileDto {
  const p = user.profile;
  return {
    userId: user.id,
    displayName: user.displayName,
    goal: p?.goal ?? null,
    age: p?.age ?? null,
    sex: p?.sex ?? null,
    heightCm: p?.heightCm ?? null,
    weightKg: p?.weightKg ?? null,
    activityLevel: p?.activityLevel ?? null,
    diet: p?.diet ?? null,
    targetWeightKg: p?.targetWeightKg ?? null,
    pace: p?.pace ?? null,
    coach: p?.coach ?? null,
    oilGheePrompt: p?.oilGheePrompt ?? false,
    stepGoal: p?.stepGoal ?? STEP_TARGET,
    waterGoalGlasses: p?.waterGoalGlasses ?? WATER_GOAL_DEFAULT,
    checkinDetailed: p?.checkinDetailed ?? false,
    onboardedAt: p?.onboardedAt?.toISOString() ?? null,
    updatedAt: p?.updatedAt?.toISOString() ?? null,
  };
}

export function usersService(repo: UsersRepository) {
  return {
    async listUsers(): Promise<UserSummaryDto[]> {
      const users = await repo.list();
      return users.map((u) => ({ id: u.id, displayName: u.displayName, onboarded: !!u.profile?.onboardedAt }));
    },

    async getProfile(userId: string): Promise<ProfileDto> {
      const user = await repo.findById(userId);
      if (!user) throw notFound("User");
      return toProfileDto(user);
    },

    async updateProfile(userId: string, data: ProfileUpdate): Promise<ProfileDto> {
      const user = await repo.findById(userId);
      if (!user) throw notFound("User");
      const profile = await repo.upsertProfile(userId, data);
      return toProfileDto({ ...user, profile });
    },
  };
}

export type UsersService = ReturnType<typeof usersService>;
