import { useActor } from "@caffeineai/core-infrastructure";
import { createActor, type backendInterface } from "../backend";
import { mockBackend } from "../mocks/backend";

const USE_MOCK_BACKEND = import.meta.env.VITE_USE_MOCK_BACKEND === "true";

export function useBackendActor(): {
  actor: backendInterface | null | undefined;
  isFetching: boolean;
} {
  const live = useActor(createActor);

  if (USE_MOCK_BACKEND) {
    return { actor: mockBackend, isFetching: false };
  }

  return live;
}
