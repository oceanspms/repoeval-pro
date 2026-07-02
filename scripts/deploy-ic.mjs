import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const network = process.argv.includes("--local") ? "local" : "ic";
const frontendEnvPath = path.join(root, "src/frontend/env.json");
const frontendDir = path.join(root, "src/frontend");
const committedBindingPaths = [
  path.join(root, "src/frontend/src/backend.ts"),
  path.join(root, "src/frontend/src/backend.d.ts"),
  path.join(root, "src/frontend/src/declarations/backend.did.js"),
  path.join(root, "src/frontend/src/declarations/backend.did.d.ts"),
];
const originalFrontendEnv = fs.existsSync(frontendEnvPath)
  ? fs.readFileSync(frontendEnvPath, "utf8")
  : null;
const backendHost =
  network === "local" ? "http://127.0.0.1:4943" : "https://icp-api.io";

function commandLine(command, args) {
  return [command, ...args].join(" ");
}

function run(command, args, options = {}) {
  console.log(`[deploy] ${commandLine(command, args)}`);
  if (process.platform === "win32") {
    execSync(commandLine(command, args), {
      cwd: options.cwd ?? root,
      stdio: "inherit",
    });
    return;
  }
  execFileSync(command, args, { cwd: options.cwd ?? root, stdio: "inherit" });
}

function capture(command, args, options = {}) {
  if (process.platform === "win32") {
    return execSync(commandLine(command, args), {
      cwd: options.cwd ?? root,
      encoding: "utf8",
    }).trim();
  }
  return execFileSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
  }).trim();
}

function writeFrontendEnv(canisterId) {
  const config = {
    backend_host: backendHost,
    backend_canister_id: canisterId,
    project_id: "repoeval-pro",
    ii_derivation_origin: "",
  };
  fs.writeFileSync(frontendEnvPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(
    `[deploy] wrote ${path.relative(root, frontendEnvPath)} for ${network} backend ${canisterId}`,
  );
}

function restoreFrontendEnv() {
  if (originalFrontendEnv === null) {
    fs.rmSync(frontendEnvPath, { force: true });
  } else {
    fs.writeFileSync(frontendEnvPath, originalFrontendEnv);
  }
}

function committedBindingsExist() {
  return committedBindingPaths.every((bindingPath) => fs.existsSync(bindingPath));
}

function refreshBindings() {
  try {
    run("corepack", ["pnpm", "bindgen"]);
  } catch (error) {
    if (!committedBindingsExist()) {
      throw error;
    }
    console.warn(
      "[deploy] caffeine-bindgen is unavailable; using committed frontend bindings.",
    );
    console.warn(
      "[deploy] If backend Candid changed, regenerate bindings before deploying.",
    );
  }
}

try {
  try {
    capture("dfx", ["--version"]);
  } catch {
    console.error("[deploy] dfx is not installed or not available on PATH.");
    console.error("[deploy] Install DFX first, then rerun this command.");
    process.exit(1);
  }

  if (network === "local") {
    try {
      capture("dfx", ["ping", "local"]);
    } catch {
      run("dfx", ["start", "--background", "--clean"]);
    }
  }

  run("mops", ["install"]);
  run("mops", ["build"]);
  refreshBindings();
  run("dfx", ["deploy", "backend", "--network", network]);

  const backendCanisterId = capture("dfx", [
    "canister",
    "--network",
    network,
    "id",
    "backend",
  ]);
  writeFrontendEnv(backendCanisterId);

  run("corepack", ["pnpm", "env:check"], { cwd: frontendDir });
  run("corepack", ["pnpm", "build"], { cwd: frontendDir });
  run("corepack", ["pnpm", "qa:deployment:strict"]);
  run("dfx", ["deploy", "frontend", "--network", network]);

  const frontendCanisterId = capture("dfx", [
    "canister",
    "--network",
    network,
    "id",
    "frontend",
  ]);

  console.log(`[deploy] backend canister: ${backendCanisterId}`);
  console.log(`[deploy] frontend canister: ${frontendCanisterId}`);
  if (network === "local") {
    console.log(
      `[deploy] local frontend URL: http://${frontendCanisterId}.localhost:4943`,
    );
    console.log(
      `[deploy] local frontend legacy URL: http://127.0.0.1:4943/?canisterId=${frontendCanisterId}`,
    );
  } else {
    console.log(
      `[deploy] IC frontend URL: https://${frontendCanisterId}.icp0.io`,
    );
  }
} finally {
  try {
    restoreFrontendEnv();
  } catch (error) {
    console.error(`[deploy] failed to restore frontend env: ${error.message}`);
    process.exitCode = 1;
  }
}
