import { execFileSync } from "node:child_process";
import { execSync } from "node:child_process";

const required = [
  { command: "node", args: ["--version"], label: "Node.js" },
  { command: "corepack", args: ["--version"], label: "Corepack" },
  { command: "mops", args: ["--version"], label: "Mops" },
  { command: "dfx", args: ["--version"], label: "DFX" },
];

let failed = false;

function check(tool) {
  try {
    const output =
      process.platform === "win32"
        ? execSync([tool.command, ...tool.args].join(" "), {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          }).trim()
        : execFileSync(tool.command, tool.args, {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          }).trim();
    console.log(`[toolchain] OK ${tool.label}: ${output || "available"}`);
  } catch (error) {
    failed = true;
    const detail = error.stderr?.toString().trim() || error.message;
    console.error(`[toolchain] FAIL ${tool.label} is not available`);
    if (detail) {
      console.error(`[toolchain] ${detail.split("\n")[0]}`);
    }
  }
}

for (const tool of required) {
  check(tool);
}

if (failed) {
  console.error("[toolchain] Install missing tools before running deploy:local or deploy:ic.");
  process.exitCode = 1;
} else {
  console.log("[toolchain] deployment toolchain is available");
}
