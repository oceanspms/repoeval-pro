import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const strictEnv = process.argv.includes("--strict-env");

let failed = false;
let warned = false;

function rel(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function fail(message) {
  failed = true;
  console.error(`[deploy] FAIL ${message}`);
}

function warn(message) {
  warned = true;
  console.warn(`[deploy] WARN ${message}`);
}

function pass(message) {
  console.log(`[deploy] OK ${message}`);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${rel(filePath)} is not valid JSON: ${error.message}`);
    return null;
  }
}

function requireFile(filePath) {
  if (fs.existsSync(filePath)) {
    pass(`${rel(filePath)} exists`);
  } else {
    fail(`${rel(filePath)} is missing`);
  }
}

function usable(value) {
  return (
    typeof value === "string" &&
    value.trim() &&
    value.trim() !== "undefined" &&
    value.trim() !== "null" &&
    !value.includes("replace-with")
  );
}

const dfxPath = path.join(root, "dfx.json");
const dfx = readJson(dfxPath);
if (dfx) {
  const backend = dfx.canisters?.backend;
  const frontend = dfx.canisters?.frontend;

  if (backend?.type !== "custom") {
    fail("dfx backend canister must be type custom");
  } else if (
    backend.wasm === "src/backend/dist/backend.wasm" &&
    backend.candid === "src/backend/dist/backend.did"
  ) {
    pass("dfx backend points to current build artifacts");
  } else {
    fail("dfx backend wasm/candid paths do not match src/backend/dist outputs");
  }

  if (frontend?.type !== "assets") {
    fail("dfx frontend canister must be type assets");
  } else if (Array.isArray(frontend.source) && frontend.source.includes("src/frontend/dist")) {
    pass("dfx frontend serves src/frontend/dist");
  } else {
    fail("dfx frontend source must include src/frontend/dist");
  }
}

requireFile(path.join(root, "src/backend/dist/backend.wasm"));
requireFile(path.join(root, "src/backend/dist/backend.did"));
requireFile(path.join(root, "src/frontend/dist/index.html"));
requireFile(path.join(root, "src/frontend/dist/env.json"));

const envPath = path.join(root, "src/frontend/env.json");
const env = readJson(envPath);
if (env) {
  if (env.backend_mode === "rest") {
    if (usable(env.backend_api_base)) {
      pass("frontend env uses REST backend mode");
    } else if (strictEnv) {
      fail("frontend REST mode requires backend_api_base");
    } else {
      warn("frontend REST mode is missing backend_api_base");
    }
  } else if (strictEnv) {
    const hasRuntimeConfig = usable(env.backend_host) && usable(env.backend_canister_id);
    if (hasRuntimeConfig) {
      pass("frontend env has backend host and canister id");
    } else {
      fail("frontend env still has placeholder backend_host/backend_canister_id");
    }
  } else {
    const hasRuntimeConfig = usable(env.backend_host) && usable(env.backend_canister_id);
    if (hasRuntimeConfig) {
      pass("frontend env has backend host and canister id");
    } else {
      warn("frontend env still has placeholder backend_host/backend_canister_id");
    }
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  const suffix = warned ? " with warnings" : "";
  console.log(`[deploy] deployment artifact check passed${suffix}`);
}
