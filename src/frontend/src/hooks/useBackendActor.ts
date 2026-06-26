import { useActor } from "@caffeineai/core-infrastructure";
import { type backendInterface, createActor } from "../backend";
import { mockBackend } from "../mocks/backend";

const USE_MOCK_BACKEND = import.meta.env.VITE_USE_MOCK_BACKEND === "true";

export function useBackendActor(): {
  actor: backendInterface | null | undefined;
  isFetching: boolean;
} {
  if (USE_MOCK_BACKEND) {
    return { actor: mockBackend, isFetching: false };
  }

  // biome-ignore lint/correctness/useHookAtTopLevel: Vite replaces USE_MOCK_BACKEND per build, so each built artifact has one stable hook path.
  const live = useActor(createActor);
  return live;
}
