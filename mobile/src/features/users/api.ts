// Server state for users and profiles (TanStack Query). The last profile seen is cached on the
// device so the app still shows it offline. UX O4: a profile save made offline (onboarding's "Start today") is kept
// on the phone as a pending update, shown as if saved, and sent when the network is back.
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/core/api/client";
import type { Profile, ProfileUpdate, UserSummary } from "@/core/api/types";
import { useNetwork } from "@/core/network/network";
import { kv, KV_KEYS } from "@/core/storage/kv";

export const userKeys = {
  all: ["users"] as const,
  profile: (id: string) => ["users", id, "profile"] as const,
};

const cacheKey = (id: string) => `zorka.profileCache.${id}`;

function readCachedProfile(id: string): Profile | undefined {
  const raw = kv.get(cacheKey(id));
  if (!raw) return undefined;
  try {
    return withPending(JSON.parse(raw) as Profile);
  } catch {
    return undefined;
  }
}

// ── Pending (offline) profile saves, UX O4 ─────────────────────────────────────────────────────────

type PendingMap = Record<string, ProfileUpdate>;

function readPending(): PendingMap {
  try {
    return JSON.parse(kv.get(KV_KEYS.pendingProfile) ?? "{}") as PendingMap;
  } catch {
    return {};
  }
}

function writePending(map: PendingMap) {
  if (Object.keys(map).length) kv.set(KV_KEYS.pendingProfile, JSON.stringify(map));
  else kv.remove(KV_KEYS.pendingProfile);
}

/** The profile with any not-yet-sent update on top, so the app acts on what the user saved. */
function withPending(profile: Profile): Profile {
  const update = readPending()[profile.userId];
  return update ? { ...profile, ...update } : profile;
}

function storeProfile(queryClient: QueryClient, profile: Profile) {
  kv.set(cacheKey(profile.userId), JSON.stringify(profile));
  queryClient.setQueryData(userKeys.profile(profile.userId), withPending(profile));
}

/** Keeps a profile update on the phone, shows it as saved, and sends it when the network allows. */
export function queueProfileSave(queryClient: QueryClient, userId: string, update: ProfileUpdate) {
  const map = readPending();
  map[userId] = { ...map[userId], ...update };
  writePending(map);
  const current = queryClient.getQueryData<Profile>(userKeys.profile(userId)) ?? readCachedProfile(userId);
  if (current) {
    const next = { ...current, ...update };
    kv.set(cacheKey(userId), JSON.stringify(next));
    queryClient.setQueryData(userKeys.profile(userId), next);
  }
  void flushPendingProfiles(queryClient);
}

let flushing = false;

/** Sends every pending profile update. Network trouble keeps it for later; a rejected update is dropped. */
export async function flushPendingProfiles(queryClient: QueryClient): Promise<void> {
  if (flushing || !useNetwork.getState().online) return;
  flushing = true;
  try {
    for (const [userId, update] of Object.entries(readPending())) {
      try {
        const { profile } = await api<{ profile: Profile }>(`/users/${userId}/profile`, {
          method: "PUT",
          body: update,
        });
        const map = readPending();
        delete map[userId];
        writePending(map);
        storeProfile(queryClient, profile);
        void queryClient.invalidateQueries({ queryKey: userKeys.all, exact: true });
      } catch (e) {
        if (e instanceof ApiError && e.kind === "http" && e.status != null && e.status < 500) {
          // The server won't take it (validation): keep the server's profile rather than retry forever.
          const map = readPending();
          delete map[userId];
          writePending(map);
          void queryClient.invalidateQueries({ queryKey: userKeys.profile(userId) });
        }
      }
    }
  } finally {
    flushing = false;
  }
}

/** Call once at app start: sends pending profile saves now and whenever the network comes back. */
export function startPendingProfileSync(queryClient: QueryClient): () => void {
  void flushPendingProfiles(queryClient);
  return useNetwork.subscribe((s, prev) => {
    if (s.online && !prev.online) void flushPendingProfiles(queryClient);
  });
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
      return withPending(profile);
    },
    placeholderData: () => (userId ? readCachedProfile(userId) : undefined),
  });
}

/** The profile is server-owned (D23), so saving it needs the network. */
export function useUpdateProfile(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (update: ProfileUpdate) =>
      (await api<{ profile: Profile }>(`/users/${userId}/profile`, { method: "PUT", body: update })).profile,
    onSuccess: (profile) => {
      storeProfile(queryClient, profile);
      queryClient.invalidateQueries({ queryKey: userKeys.all, exact: true });
    },
  });
}
