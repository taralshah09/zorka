import { useQuery } from "@tanstack/react-query";

import { api } from "@/core/api/client";

export function useServerProbes(userId: string | null) {
  return useQuery({
    queryKey: ["dev", "sync-probes", userId],
    enabled: !!userId,
    queryFn: async () =>
      (await api<{ probes: { id: string; note: string; clientUpdatedAt: string }[] }>(`/users/${userId}/sync-probes`))
        .probes,
  });
}
