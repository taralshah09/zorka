// Web nutrition lookup for a voice-logged food the catalog doesn't have. The server searches the open web
// (Tavily → Firecrawl → Anakin) and the AI reads one serving's numbers; Create food is pre-filled with them and the
// person checks and edits before saving.
import { useQuery } from "@tanstack/react-query";

import { api } from "@/core/api/client";
import type { FoodLookupResult } from "@/core/api/types";

export function useFoodLookup(userId: string | null, name: string, enabled: boolean) {
  return useQuery({
    queryKey: ["foodLookup", userId, name.trim().toLowerCase()],
    enabled: enabled && !!userId && !!name.trim(),
    staleTime: Infinity,
    retry: 0,
    queryFn: () =>
      api<FoodLookupResult>(`/users/${userId}/foods/lookup`, {
        method: "POST",
        body: { name: name.trim() },
        timeoutMs: 30_000,
      }),
  });
}
