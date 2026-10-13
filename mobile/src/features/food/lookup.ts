// Web nutrition lookup for a voice-logged food the catalog doesn't have. The server searches the open web
// (Tavily → Firecrawl → Anakin) and the AI reads one serving's numbers; Create food is pre-filled with them and the
// person checks and edits before saving. The confirm sheet runs the same query first (UX L5), so Create food opens
// with the answer already cached.
import { useQuery } from "@tanstack/react-query";

import { api } from "@/core/api/client";
import type { FoodLookupResult } from "@/core/api/types";

export const foodLookupQuery = (userId: string | null, name: string) => ({
  queryKey: ["foodLookup", userId, name.trim().toLowerCase()],
  staleTime: Infinity,
  retry: 0,
  queryFn: () =>
    api<FoodLookupResult>(`/users/${userId}/foods/lookup`, {
      method: "POST",
      body: { name: name.trim() },
      timeoutMs: 30_000,
    }),
});

export function useFoodLookup(userId: string | null, name: string, enabled: boolean) {
  return useQuery({ ...foodLookupQuery(userId, name), enabled: enabled && !!userId && !!name.trim() });
}
