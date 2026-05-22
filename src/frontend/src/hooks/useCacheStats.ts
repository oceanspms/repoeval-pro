import { useActor } from "@caffeineai/core-infrastructure";
import { useQuery } from "@tanstack/react-query";
import { createActor } from "../backend";
import type { CacheStats } from "../types";

export function useCacheStats() {
  const { actor, isFetching } = useActor(createActor);

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
