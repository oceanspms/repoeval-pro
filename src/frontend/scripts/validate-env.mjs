import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), "env.json");

function fail(message) {
  console.error(`[env] ${message}`);
  process.exitCode = 1;
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

function validUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validCanisterId(value) {
  return /^[a-z0-9]+(-[a-z0-9]+)+$/.test(value);
}

if (!fs.existsSync(envPath)) {
  fail("env.json is missing");
} else {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(envPath, "utf8"));
  } catch (error) {
    fail(`env.json is not valid JSON: ${error.message}`);
    config = {};
  }

  const backendHost = String(config.backend_host ?? "").trim();
  const backendCanisterId = String(config.backend_canister_id ?? "").trim();

  if (!usable(backendHost)) {
    fail("backend_host must be set to the deployed backend host");
  } else if (!validUrl(backendHost)) {
    fail("backend_host must be an http(s) URL");
  }
  if (!usable(backendCanisterId)) {
    fail("backend_canister_id must be set before production deployment");
  } else if (!validCanisterId(backendCanisterId)) {
    fail("backend_canister_id does not look like a valid canister principal");
  }
}

if (!process.exitCode) {
  console.log("[env] env.json is deployment-ready");
}
