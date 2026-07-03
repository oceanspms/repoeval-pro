import { useEffect, useState } from "react";
import { HttpAgent } from "@icp-sdk/core/agent";
import { ExternalBlob, type backendInterface, createActor } from "../backend";
import { mockBackend } from "../mocks/backend";

interface FrontendRuntimeEnv {
  backend_host?: string;
  backend_canister_id?: string;
}

interface ActorState {
  actor: backendInterface | null | undefined;
  isFetching: boolean;
}

const USE_MOCK_BACKEND = import.meta.env.VITE_USE_MOCK_BACKEND === "true";
const DEFAULT_BACKEND_HOST = "https://icp-api.io";

let envPromise: Promise<FrontendRuntimeEnv> | null = null;
let actorCache:
  | {
      key: string;
      actor: backendInterface;
    }
  | undefined;

function usable(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") {
    return undefined;
  }
  return trimmed;
}

async function loadRuntimeEnv(): Promise<FrontendRuntimeEnv> {
  if (!envPromise) {
    envPromise = fetch("/env.json", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : {}))
      .catch(() => ({}));
  }
  return envPromise;
}

function fallbackCanisterId(): string | undefined {
  const env = typeof process !== "undefined" ? process.env : {};
  return usable(env.CANISTER_ID_BACKEND) ?? usable(env.CANISTER_BACKEND);
}

function isLocalHost(host: string): boolean {
  try {
    const url = new URL(host);
    return (
      url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname.endsWith(".localhost")
    );
  } catch {
    return host.includes("127.0.0.1") || host.includes("localhost");
  }
}

async function buildActor(
  config: FrontendRuntimeEnv,
): Promise<backendInterface | undefined> {
  const canisterId = usable(config.backend_canister_id) ?? fallbackCanisterId();
  if (!canisterId) return undefined;

  const host = usable(config.backend_host) ?? DEFAULT_BACKEND_HOST;
  const key = `${host}|${canisterId}`;
  if (actorCache?.key === key) return actorCache.actor;

  const agent = HttpAgent.createSync({ host });
  if (isLocalHost(host)) {
    await agent.fetchRootKey();
  }

  const actor = createActor(
    canisterId,
    (file) => file.getBytes(),
    async (bytes) => ExternalBlob.fromBytes(new Uint8Array(bytes)),
    {
      agent,
    },
  );

  actorCache = { key, actor };
  return actor;
}

export function useBackendActor(): ActorState {
  const [state, setState] = useState<ActorState>(() =>
    USE_MOCK_BACKEND
      ? { actor: mockBackend, isFetching: false }
      : { actor: undefined, isFetching: true },
  );

  useEffect(() => {
    if (USE_MOCK_BACKEND) {
      setState({ actor: mockBackend, isFetching: false });
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, isFetching: true }));

    void loadRuntimeEnv()
      .then((config) => {
        if (cancelled) return;
        return buildActor(config);
      })
      .then((actor) => {
        if (cancelled) return;
        setState({ actor, isFetching: false });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ actor: undefined, isFetching: false });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
