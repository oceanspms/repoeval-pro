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

if (!fs.existsSync(envPath)) {
  fail("env.json is missing");
} else {
  const config = JSON.parse(fs.readFileSync(envPath, "utf8"));
  if (!usable(config.backend_host)) {
    fail("backend_host must be set to the deployed backend host");
  }
  if (!usable(config.backend_canister_id)) {
    fail("backend_canister_id must be set before production deployment");
  }
}

if (!process.exitCode) {
  console.log("[env] env.json is deployment-ready");
}
