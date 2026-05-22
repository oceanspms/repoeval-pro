import { useActor } from "@caffeineai/core-infrastructure";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { createActor } from "../backend";
import type { EvaluationRecord } from "../types";

export const HISTORY_QUERY_KEY = ["history"] as const;

/** Extract GitHub username from a repo URL as owner fallback */
function ownerFromUrl(repoUrl: string): string {
  try {
    const parts = repoUrl
      .replace(/^https?:\/\/(www\.)?github\.com\//, "")
      .split("/");
    return parts[0] ?? "";
  } catch {
    return "";
  }
}

function normalizeRecord(r: {
  id: string;
  repo_url: string;
  assignment_text: string;
  result: EvaluationRecord["result"];
  timestamp: bigint;
  owner?: string;
}): EvaluationRecord {
  const owner = r.owner?.trim() || ownerFromUrl(r.repo_url) || "";
  return { ...r, owner };
}

export function useHistory() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();

  const query = useQuery<EvaluationRecord[]>({
    queryKey: HISTORY_QUERY_KEY,
    queryFn: async () => {
      if (!actor) return [];
      const raw = await actor.getHistory();
      return Array.isArray(raw) ? raw.map(normalizeRecord) : [];
    },
    enabled: !!actor,
    staleTime: 0,
    // Always refetch when the component mounts (tab switch) or window refocuses
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  /** Force-refresh history — call after mutations (evaluate, delete). */
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
  }, [queryClient]);

  return { ...query, refresh };
}
