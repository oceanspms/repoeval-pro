import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import type { EvaluationFormData, EvaluationResult } from "../types";
import { useBackendActor } from "./useBackendActor";
import { HISTORY_QUERY_KEY } from "./useHistory";

interface EvaluationState {
  /** Array of results — one per repo URL evaluated */
  data: EvaluationResult[] | null;
  loading: boolean;
  error: string | null;
}

// Session-level cache — module-level so it persists across re-renders
const sessionCache = new Map<string, EvaluationResult[]>();

/**
 * Build a cache key that includes repo URLs, assignment text, AND notes.
 * Different notes with the same repo+assignment must produce a fresh evaluation.
 */
function makeCacheKey(
  repoUrls: string[],
  assignmentDescription: string,
  optionalNotes: string,
): string {
  const notesSample = (optionalNotes || "").slice(0, 100);
  return [
    repoUrls.join(",").toLowerCase(),
    assignmentDescription.slice(0, 200),
    notesSample,
  ].join("|");
}

export function useEvaluation() {
  const { actor, isFetching } = useBackendActor();
  const queryClient = useQueryClient();
  const [state, setState] = useState<EvaluationState>({
    data: null,
    loading: false,
    error: null,
  });
  const abortRef = useRef<boolean>(false);

  const evaluate = useCallback(
    async (form: EvaluationFormData) => {
      if (!actor || isFetching) {
        setState((s) => ({
          ...s,
          error: "Backend not ready. Please try again in a moment.",
        }));
        return;
      }

      const cacheKey = makeCacheKey(
        form.repoUrls,
        form.assignmentDescription,
        form.optionalNotes,
      );
      const cached = sessionCache.get(cacheKey);
      if (cached) {
        setState({
          data: cached.map((r) => ({ ...r, cached: true })),
          loading: false,
          error: null,
        });
        void queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
        return;
      }

      abortRef.current = false;
      setState({ data: null, loading: true, error: null });

      try {
        const results = await actor.evaluate(
          form.repoUrls,
          form.assignmentDescription,
          form.optionalNotes.trim() || null,
        );

        const arr = Array.isArray(results) ? results : [results];

        if (!abortRef.current) {
          if (arr.length > 0) {
            sessionCache.set(cacheKey, arr);
            setState({ data: arr, loading: false, error: null });
          } else {
            setState({
              data: null,
              loading: false,
              error: "No evaluation result returned.",
            });
          }
          // Force all queries — active and inactive — to refetch immediately.
          void queryClient.invalidateQueries({
            queryKey: HISTORY_QUERY_KEY,
            refetchType: "all",
          });
        }
      } catch (err) {
        if (!abortRef.current) {
          const message =
            err instanceof Error
              ? err.message
              : "Evaluation failed. Please try again.";
          setState({ data: null, loading: false, error: message });
        }
      }
    },
    [actor, isFetching, queryClient],
  );

  const reset = useCallback(() => {
    abortRef.current = true;
    setState({ data: null, loading: false, error: null });
  }, []);

  /** Clear results AND wipe the session cache — used by "New Evaluation" */
  const clearAll = useCallback(() => {
    abortRef.current = true;
    sessionCache.clear();
    setState({ data: null, loading: false, error: null });
  }, []);

  return {
    ...state,
    evaluate,
    reset,
    clearAll,
    isReady: !!actor && !isFetching,
  };
}
