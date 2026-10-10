// Server state for users and profiles (TanStack Query). The last profile seen is cached on the
// device so the app still shows it offline.
import { useQuery } from "@tanstack/react-query";

import { api } from "@/core/api/client";
import type { Profile, UserSummary } from "@/core/api/types";
import { kv } from "@/core/storage/kv";

export const userKeys = {
  all: ["users"] as const,
  profile: (id: string) => ["users", id, "profile"] as const,
};

const cacheKey = (id: string) => `kimbo.profileCache.${id}`;

function readCachedProfile(id: string): Profile | undefined {
  const raw = kv.get(cacheKey(id));
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Profile;
  } catch {
    return undefined;
  }
}

export function useUsers() {
  return useQuery({
    queryKey: userKeys.all,
    queryFn: async () => (await api<{ users: UserSummary[] }>("/users")).users,
  });
}

export function useProfile(userId: string | null) {
  return useQuery({
    queryKey: userKeys.profile(userId ?? "none"),
    enabled: !!userId,
    queryFn: async () => {
      const { profile } = await api<{ profile: Profile }>(`/users/${userId}/profile`);
      kv.set(cacheKey(profile.userId), JSON.stringify(profile));
      return profile;
    },
    placeholderData: () => (userId ? readCachedProfile(userId) : undefined),
  });
}
