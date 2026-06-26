import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const distDir = path.join(root, "dist");
const assetsDir = path.join(distDir, "assets");
const requiredFiles = [
  path.join(distDir, "index.html"),
  path.join(distDir, "env.json"),
];

function fail(message) {
  console.error(`[smoke] ${message}`);
  process.exitCode = 1;
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

for (const filePath of requiredFiles) {
  if (!fs.existsSync(filePath)) {
    fail(`missing required build file: ${path.relative(root, filePath)}`);
  }
}

const html = fs.existsSync(requiredFiles[0]) ? read(requiredFiles[0]) : "";
if (!html.includes('id="root"')) {
  fail("dist/index.html is missing the React root node");
}

let jsBundle = "";
if (!fs.existsSync(assetsDir)) {
  fail("dist/assets directory is missing");
} else {
  const jsFiles = fs
    .readdirSync(assetsDir)
    .filter((fileName) => /^index-.*\.js$/.test(fileName));
  if (jsFiles.length === 0) {
    fail("no frontend JS bundle found in dist/assets");
  }
  jsBundle = jsFiles.map((fileName) => read(path.join(assetsDir, fileName))).join("\n");
}

const requiredBundleText = [
  "Repository Evaluation",
  "Evaluation History",
  "Reporting Center",
  "Download All",
  "Role Report",
  "Evaluate",
];

for (const text of requiredBundleText) {
  if (!jsBundle.includes(text)) {
    fail(`built bundle missing UI text: ${text}`);
  }
}

if (process.env.VITE_USE_MOCK_BACKEND === "true" && !jsBundle.includes("mockBackend")) {
  fail("mock-mode build is missing mockBackend wiring");
}

if (!process.exitCode) {
  console.log("[smoke] build output contains the main evaluation, history, reporting, and export flows");
}
