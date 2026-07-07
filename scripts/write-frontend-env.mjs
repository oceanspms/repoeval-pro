import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const envPath = path.join(root, "src/frontend/env.json");

function readEnv(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function firstUsable(names) {
  for (const name of names) {
    const value = readEnv(name);
    if (usable(value)) {
      return value;
    }
  }
  return "";
}

function usable(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value !== "undefined" &&
    value !== "null" &&
    !value.includes("replace-with")
  );
}

const backendHost = readEnv("VITE_BACKEND_HOST") || "https://icp-api.io";
const backendCanisterId = firstUsable([
  "VITE_BACKEND_CANISTER_ID",
  "CANISTER_ID_BACKEND",
  "CANISTER_BACKEND",
]);
const projectId = readEnv("VITE_PROJECT_ID") || "repoeval-pro";
const iiDerivationOrigin = readEnv("VITE_II_DERIVATION_ORIGIN");

if (!usable(backendHost)) {
  console.error("[env] VITE_BACKEND_HOST is not usable");
  process.exit(1);
}

if (!usable(backendCanisterId)) {
  console.error(
    "[env] Set VITE_BACKEND_CANISTER_ID to the deployed backend canister ID before building the hosted frontend.",
  );
  process.exit(1);
}

const config = {
  backend_host: backendHost,
  backend_canister_id: backendCanisterId,
  project_id: projectId,
  ii_derivation_origin: iiDerivationOrigin,
};

fs.writeFileSync(envPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(
  `[env] wrote ${path.relative(root, envPath)} for backend ${backendCanisterId} at ${backendHost}`,
);
