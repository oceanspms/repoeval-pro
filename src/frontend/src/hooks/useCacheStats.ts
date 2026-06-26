import { useQuery } from "@tanstack/react-query";
import type { CacheStats } from "../types";
import { useBackendActor } from "./useBackendActor";

export function useCacheStats() {
  const { actor, isFetching } = useBackendActor();

  return useQuery<CacheStats>({
    queryKey: ["cacheStats"],
    queryFn: async () => {
      if (!actor) return { entries: 0n, lastHit: false };
      return actor.getCacheStats();
    },
    enabled: !!actor && !isFetching,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}
