const EMPTY_SIGNALS = {
  readme_text: "",
  file_tree: [],
  has_dockerfile: false,
  has_compose: false,
  has_ci: false,
  has_terraform: false,
  has_backend: false,
  has_frontend: false,
  has_auth: false,
  has_db_config: false,
  has_api_routes: false,
  has_demo_link: false,
  has_working_demo_link: false,
  demo_url: null,
  has_ai_log: false,
  readme_word_count: 0,
  todo_count: 0,
  has_env_example: false,
  has_seed_data: false,
  has_setup_script: false,
  error_handler_count: 0,
  file_count: 0,
  detected_frameworks: [],
  todo_count_source: 0,
  test_count: 0,
  has_dockerfile_multistage: false,
  has_scripts: false,
  fetched_file_paths: [],
  key_file_summaries: [],
};

const FRAMEWORKS = [
  "react",
  "vue",
  "angular",
  "svelte",
  "next",
  "nuxt",
  "express",
  "fastify",
  "nestjs",
  "django",
  "flask",
  "fastapi",
  "rails",
  "spring",
  "tailwindcss",
  "vite",
  "prisma",
  "mongoose",
  "sequelize",
  "typeorm",
  "jest",
  "vitest",
  "pytest",
  "typescript",
  "graphql",
];

export function parseGithubUrl(url) {
  try {
    const normalized = url.trim().replace(/\.git$/, "");
    const parsed = normalized.startsWith("http")
      ? new URL(normalized)
      : new URL(`https://${normalized}`);
    if (parsed.hostname !== "github.com") return null;
    const [owner, repo] = parsed.pathname.split("/").filter(Boolean);
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

function lower(value) {
  return String(value ?? "").toLowerCase();
}

function includesAny(value, needles) {
  const haystack = lower(value);
  return needles.some((needle) => haystack.includes(needle));
}

function pathContains(paths, needle) {
  const n = lower(needle);
  return paths.some((path) => lower(path).includes(n));
}

function countOccurrences(value, needle) {
  return lower(value).split(needle).length - 1;
}

function wordCount(value) {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function displayRequirement(item) {
  return item.startsWith("[") && item.includes("]")
    ? item.slice(item.indexOf("]") + 1).trim()
    : item;
}

function requirementCategory(item) {
  const il = lower(item);
  const prefixed = il.match(/^\[[^:\]]+:([^\]]+)\]/);
  if (prefixed) return prefixed[1];
  if (includesAny(il, ["auth", "login", "jwt", "otp", "rbac", "permission", "ownership"])) return "auth";
  if (includesAny(il, ["api", "endpoint", "route", "crud", "request", "response"])) return "api";
  if (includesAny(il, ["database", "postgres", "mongodb", "schema", "model", "migration", "field", "constraint", "index"])) return "data";
  if (includesAny(il, ["frontend", "ui", "react", "component", "responsive", "screen"])) return "ui";
  if (includesAny(il, ["test", "spec", "coverage"])) return "tests";
  if (includesAny(il, ["readme", "documentation", "docs", "setup"])) return "docs";
  if (includesAny(il, ["deploy", "demo", "public base url", "live url"])) return "deployment";
  if (includesAny(il, ["docker", "ci", "pipeline", "terraform", "kubernetes"])) return "devops";
  if (includesAny(il, ["qa", "e2e", "acceptance"])) return "qa";
  if (includesAny(il, ["machine learning", "model training", "dataset", "inference"])) return "ml";
  return "general";
}

function severityPrefix(line, category, core) {
  return `[${core ? "core" : "required"}:${category}] ${line}`;
}

function categoryForLine(line) {
  return requirementCategory(line);
}

function splitAtomicRequirements(text) {
  return text
    .replace(/\r/g, "\n")
    .replace(/\s+(\d+[\).])/g, "\n$1 ")
    .split(/\n|(?:^|\s)[-*•]\s+/)
    .flatMap((line) => line.split(/\s(?=\d+[\).]\s+)/))
    .map((line) => line.replace(/^\d+[\).]\s*/, "").trim())
    .filter((line) => line.length >= 6 && line.length <= 280);
}

export function parseAssignment(assignmentText) {
  const text = String(assignmentText ?? "").slice(0, 20000);
  const l = lower(text);
  const asksFrontend = includesAny(l, ["frontend", "front-end", "user interface", "react", "vue", "angular", "responsive"]);
  const explicitFullstack = includesAny(l, ["fullstack", "full-stack", "full stack"]);
  const asksBackend = includesAny(l, ["backend", "back-end", "server", "database", "postgres", "mongodb", "auth", "endpoint"]) ||
    (!asksFrontend && includesAny(l, ["api", "rest", "graphql"]));
  const asksDevops = includesAny(l, ["docker", "kubernetes", "terraform", "ci/cd", "pipeline", "infrastructure"]);
  const asksQa = includesAny(l, ["qa", "test plan", "e2e", "acceptance criteria"]);
  const asksMl = includesAny(l, ["machine learning", "model training", "dataset", "inference"]);

  const role = explicitFullstack || (asksFrontend && asksBackend)
    ? "Fullstack"
    : asksBackend
      ? "Backend"
      : asksFrontend
        ? "Frontend"
        : asksDevops
          ? "DevOps"
          : asksQa
            ? "QA"
            : asksMl
              ? "ML"
              : "General";

  const rawItems = splitAtomicRequirements(text);
  const selected = rawItems.filter((line) =>
    includesAny(line, [
      "must",
      "required",
      "build",
      "implement",
      "create",
      "include",
      "endpoint",
      "field",
      "feature",
      "auth",
      "database",
      "test",
      "readme",
      "deploy",
      "docker",
      "ui",
    ]),
  );

  const fallback = [];
  if (asksBackend) fallback.push("Implement backend/API requirements", "Provide persistence/database layer");
  if (asksFrontend) fallback.push("Implement frontend/UI requirements");
  if (includesAny(l, ["auth", "login", "signup", "otp", "jwt"])) fallback.push("Implement authentication");
  if (includesAny(l, ["test", "coverage"])) fallback.push("Include tests");
  if (includesAny(l, ["readme", "document", "setup"])) fallback.push("Provide README/setup documentation");
  if (includesAny(l, ["deploy", "live", "public url"])) fallback.push("Provide live deployment evidence");

  const requirements = (selected.length ? selected : fallback).slice(0, 18);
  const required_items = requirements.map((line) => {
    const category = categoryForLine(line);
    const optional = includesAny(line, ["optional", "bonus", "nice to have"]);
    return severityPrefix(line, category, !optional && category !== "docs");
  });

  const core_items = required_items.filter((item) => item.startsWith("[core:"));
  const secondary_items = required_items.filter((item) => !item.startsWith("[core:"));
  return { role, required_items, core_items, secondary_items };
}

function selectFilesToFetch(paths) {
  const selected = [];
  const addFirst = (candidates) => {
    for (const candidate of candidates) {
      const found = paths.find((p) => lower(p) === candidate || lower(p).endsWith(`/${candidate}`));
      if (found && !selected.includes(found)) {
        selected.push(found);
        return;
      }
    }
  };
  addFirst(["package.json"]);
  addFirst(["src/index.ts", "src/main.ts", "src/app.ts", "server.ts", "src/server.ts", "src/index.js", "src/main.js", "app.py", "main.py"]);

  for (const path of paths) {
    const pl = lower(path);
    const implementation =
      includesAny(pl, ["routes/", "controllers/", "views.", "serializers.", "permissions.", "middleware", "schema.", "prisma", "models.", "models/", "migrations/", "services/"]);
    if (implementation && selected.length < 8 && !selected.includes(path)) selected.push(path);
  }

  for (const path of paths) {
    const pl = lower(path);
    if ((pl.includes(".test.") || pl.includes(".spec.") || pl.includes("/tests/") || pl.includes("test_")) && selected.length < 8 && !selected.includes(path)) {
      selected.push(path);
    }
  }

  addFirst(["Dockerfile", "dockerfile"]);
  addFirst([".env.example", ".env.sample", "env.example"]);
  return selected.slice(0, 8);
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "RepoEval-Pro/1.0",
      ...headers,
    },
  });
  if (!response.ok) return "";
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "RepoEval-Pro/1.0",
      Accept: "application/vnd.github.v3+json",
    },
  });
  if (!response.ok) return null;
  return response.json();
}

function extractDemoUrl(text) {
  const match = String(text ?? "").match(/https?:\/\/[^\s)>\]]+/i);
  return match?.[0]?.replace(/[.,;]+$/, "") ?? null;
}

async function verifyDemoUrl(url) {
  if (!url) return false;
  try {
    const response = await fetch(url, { method: "GET", redirect: "follow" });
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  }
}

function extractSignals(readmeText, fileTree, sourceFiles) {
  const paths = fileTree.map(String);
  const joinedPaths = paths.join("\n").toLowerCase();
  const readmeLower = lower(readmeText);
  const sourceText = sourceFiles.map((file) => file.content).join("\n").toLowerCase();
  const packageJson = sourceFiles.find((file) => lower(file.path).endsWith("package.json"))?.content ?? "";
  const frameworks = FRAMEWORKS.filter((fw) => lower(packageJson).includes(fw) || joinedPaths.includes(fw));
  const demoUrl = extractDemoUrl(readmeText);

  return {
    ...EMPTY_SIGNALS,
    readme_text: readmeText,
    file_tree: paths,
    has_dockerfile: pathContains(paths, "dockerfile"),
    has_compose: pathContains(paths, "docker-compose") || pathContains(paths, "compose.yaml"),
    has_ci: pathContains(paths, ".github/workflows") || pathContains(paths, ".gitlab-ci") || pathContains(paths, "bitbucket-pipelines"),
    has_terraform: pathContains(paths, ".tf") || pathContains(paths, "terraform"),
    has_backend: includesAny(joinedPaths, ["server.", "app.py", "main.py", "routes/", "controllers/", "views.", "api/", "src/app.", "src/server."]),
    has_frontend: includesAny(joinedPaths, ["components/", "pages/", ".tsx", ".jsx", "vite.config", "next.config", "src/main."]),
    has_auth: includesAny(joinedPaths + sourceText + readmeLower, ["auth", "login", "signup", "jwt", "oauth", "otp", "permission"]),
    has_db_config: includesAny(joinedPaths + sourceText + readmeLower, ["postgres", "mongodb", "mysql", "sqlite", "prisma", "sequelize", "typeorm", "mongoose", "models.", "schema.", "migration"]),
    has_api_routes: includesAny(joinedPaths + sourceText, ["routes/", "controllers/", "views.", "urls.py", "router", "endpoint", "app.get", "app.post", "@app.", "router."]),
    has_demo_link: Boolean(demoUrl),
    has_working_demo_link: false,
    demo_url: demoUrl,
    has_ai_log: includesAny(joinedPaths + readmeLower, ["prompt", "ai-log", "chatgpt", "cursor", "claude", "caffeine"]),
    readme_word_count: wordCount(readmeText),
    todo_count: countOccurrences(readmeLower, "todo") + countOccurrences(sourceText, "todo") + countOccurrences(sourceText, "fixme"),
    has_env_example: pathContains(paths, ".env.example") || pathContains(paths, ".env.sample"),
    has_seed_data: pathContains(paths, "seed"),
    has_setup_script: pathContains(paths, "makefile") || pathContains(paths, "setup.sh") || pathContains(paths, "start.sh"),
    error_handler_count: countOccurrences(sourceText, "catch") + countOccurrences(sourceText, "try ") + countOccurrences(sourceText, "except"),
    file_count: paths.length,
    detected_frameworks: frameworks,
    todo_count_source: countOccurrences(sourceText, "todo") + countOccurrences(sourceText, "fixme"),
    test_count: paths.filter((p) => includesAny(p, [".test.", ".spec.", "/tests/", "test_"])).length +
      countOccurrences(sourceText, "it(") + countOccurrences(sourceText, "test(") + countOccurrences(sourceText, "describe(") + countOccurrences(sourceText, "def test_"),
    has_dockerfile_multistage: countOccurrences(sourceText, "\nfrom ") >= 2,
    has_scripts: includesAny(packageJson, ['"start"', '"dev"', '"build"']),
    fetched_file_paths: sourceFiles.map((file) => file.path),
    key_file_summaries: sourceFiles.map((file) => [file.path, `${file.path} (${file.content.length} bytes)`]),
  };
}

async function fetchRepoSignals(repoUrl, notesText) {
  const parsed = parseGithubUrl(repoUrl);
  if (!parsed) return { ...EMPTY_SIGNALS };
  const { owner, repo } = parsed;
  const readme = await fetchText(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`);
  const treeJson = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`);
  const fileTree = Array.isArray(treeJson?.tree) ? treeJson.tree.map((item) => item.path).filter(Boolean) : [];
  const selected = selectFilesToFetch(fileTree);
  const sourceFiles = [];
  for (const path of selected) {
    const content = await fetchText(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`);
    if (content) sourceFiles.push({ path, content: content.slice(0, 20000) });
  }
  const signals = extractSignals(readme, fileTree, sourceFiles);
  const notesUrl = extractDemoUrl(notesText);
  const demoUrl = notesUrl || signals.demo_url;
  signals.demo_url = demoUrl;
  signals.has_demo_link = Boolean(demoUrl);
  signals.has_working_demo_link = await verifyDemoUrl(demoUrl);
  return signals;
}

function categoryMatched(category, label, signals) {
  const l = lower(label);
  switch (category) {
    case "auth":
      return signals.has_auth;
    case "api":
      return signals.has_api_routes || signals.has_backend;
    case "data":
      return signals.has_db_config;
    case "ui":
      return signals.has_frontend;
    case "tests":
      return signals.test_count > 0;
    case "docs":
      return signals.readme_word_count > 100 || pathContains(signals.file_tree, "docs/");
    case "deployment":
      return signals.has_working_demo_link || signals.has_dockerfile || signals.has_compose || signals.has_scripts;
    case "devops":
      return signals.has_dockerfile || signals.has_compose || signals.has_ci || signals.has_terraform;
    case "qa":
      return signals.test_count > 0;
    case "ml":
      return pathContains(signals.file_tree, "model") || pathContains(signals.file_tree, "notebook") || pathContains(signals.file_tree, "dataset");
    default:
      return pathContains(signals.file_tree, l) || lower(signals.readme_text).includes(l);
  }
}

function matchRequirements(parsed, signals) {
  let matched = 0;
  const missing = [];
  for (const item of parsed.required_items) {
    const label = displayRequirement(item);
    const category = requirementCategory(item);
    const itl = lower(label);
    const found =
      categoryMatched(category, label, signals) ||
      (itl.includes("docker") && (signals.has_dockerfile || signals.has_compose)) ||
      (itl.includes("ci") && signals.has_ci) ||
      (itl.includes("backend") && signals.has_backend) ||
      (itl.includes("api") && (signals.has_backend || signals.has_api_routes)) ||
      (itl.includes("frontend") && signals.has_frontend) ||
      (itl.includes("react") && signals.has_frontend) ||
      (itl.includes("auth") && signals.has_auth) ||
      (itl.includes("database") && signals.has_db_config) ||
      (itl.includes("test") && signals.test_count > 0) ||
      (itl.includes("readme") && signals.readme_word_count > 50);
    if (found) matched += 1;
    else missing.push(label);
  }
  return { matched, missing };
}

function coverageScore(matched, total, coreMissing, secondaryMissing) {
  if (!total) return 50;
  return clampScore((matched * 100) / total - coreMissing * 20 - secondaryMissing * 5);
}

function stackMatchScore(parsed, signals) {
  const role = lower(parsed.role);
  let score = 50;
  if (role === "backend") {
    score = 30 + (signals.has_backend ? 20 : 0) + (signals.has_api_routes ? 20 : 0) + (signals.has_db_config ? 15 : 0) + (signals.has_auth ? 10 : 0) + (signals.test_count > 0 ? 5 : 0);
  } else if (role === "frontend") {
    score = 35 + (signals.has_frontend ? 30 : 0) + (signals.has_scripts ? 10 : 0) + (signals.test_count > 0 ? 10 : 0) + (signals.readme_word_count > 100 ? 15 : 0);
  } else if (role === "fullstack") {
    score = 20 + (signals.has_backend ? 20 : 0) + (signals.has_frontend ? 20 : 0) + (signals.has_db_config ? 15 : 0) + (signals.has_api_routes ? 15 : 0) + (signals.test_count > 0 ? 10 : 0);
  } else if (role === "devops") {
    score = 30 + (signals.has_dockerfile ? 20 : 0) + (signals.has_compose ? 15 : 0) + (signals.has_ci ? 20 : 0) + (signals.has_terraform ? 15 : 0);
  }
  return clampScore(score);
}

function completenessScore(signals) {
  return clampScore(
    25 +
      Math.min(20, signals.file_count / 2) +
      (signals.readme_word_count > 100 ? 15 : 0) +
      (signals.has_scripts ? 10 : 0) +
      (signals.has_env_example ? 10 : 0) +
      (signals.test_count > 0 ? 10 : 0) +
      (signals.has_setup_script ? 10 : 0),
  );
}

function depthScore(signals) {
  return clampScore(
    35 +
      (signals.has_api_routes ? 15 : 0) +
      (signals.has_db_config ? 15 : 0) +
      (signals.has_auth ? 10 : 0) +
      (signals.error_handler_count > 2 ? 10 : 0) +
      (signals.test_count > 0 ? 10 : 0) -
      Math.min(20, signals.todo_count_source * 2),
  );
}

function docsScore(signals) {
  return clampScore(
    (signals.readme_word_count > 50 ? 35 : 10) +
      (signals.readme_word_count > 200 ? 25 : 0) +
      (signals.has_env_example ? 15 : 0) +
      (signals.has_setup_script || signals.has_scripts ? 15 : 0) +
      (pathContains(signals.file_tree, "docs/") ? 10 : 0),
  );
}

function demoScore(signals) {
  return clampScore(
    20 +
      (signals.has_working_demo_link ? 45 : signals.has_demo_link ? 15 : 0) +
      (signals.has_dockerfile ? 15 : 0) +
      (signals.has_compose ? 10 : 0) +
      (signals.has_scripts ? 10 : 0),
  );
}

function aiUsageScore(signals, notesText) {
  const hasEvidence = signals.has_ai_log || includesAny(notesText, ["prompt", "cursor", "chatgpt", "claude", "caffeine"]);
  return hasEvidence ? 100 : 50;
}

function finalScore(scores) {
  return clampScore(
    scores.coverage * 0.3 +
      scores.stackMatch * 0.18 +
      scores.completeness * 0.17 +
      scores.depth * 0.17 +
      scores.docs * 0.1 +
      scores.demoReadiness * 0.05 +
      scores.aiUsage * 0.03,
  );
}

function capFinalScore(score, coreMissingGroups, roleEvidenceMissing) {
  let capped = score;
  if (coreMissingGroups >= 2) capped = Math.min(capped, 59);
  else if (coreMissingGroups === 1) capped = Math.min(capped, 74);
  if (roleEvidenceMissing) capped = Math.min(capped, 59);
  return capped;
}

function roleEvidenceMissing(parsed, signals) {
  const role = lower(parsed.role);
  if (role === "backend") return !signals.has_backend && !signals.has_api_routes;
  if (role === "frontend") return !signals.has_frontend;
  if (role === "fullstack") return !signals.has_backend || !signals.has_frontend;
  if (role === "devops") return !signals.has_dockerfile && !signals.has_ci && !signals.has_terraform;
  return false;
}

function verdictFromScore(score, scores, coreMissingGroups) {
  if (score >= 75 && coreMissingGroups === 0 && scores.coverage >= 70) return "pass";
  if (score >= 55) return "caution";
  return "fail";
}

function alignmentFromScore(score) {
  if (score >= 75) return "High";
  if (score >= 55) return "Medium";
  return "Low";
}

function buildStrengths(scores, signals) {
  const strengths = [];
  if (scores.coverage >= 70) strengths.push(`Assignment coverage ${scores.coverage}/100`);
  if (signals.has_api_routes) strengths.push("API route/controller evidence found");
  if (signals.has_backend) strengths.push("Backend/API code detected");
  if (signals.has_frontend) strengths.push("Frontend/UI code detected");
  if (signals.has_db_config) strengths.push("Database/persistence configuration found");
  if (signals.has_auth) strengths.push("Authentication evidence found");
  if (signals.test_count > 0) strengths.push(`Tests detected: ${signals.test_count}`);
  if (signals.readme_word_count > 100) strengths.push("README/setup documentation present");
  if (signals.has_working_demo_link) strengths.push("Live URL evidence verified");
  return strengths.length ? strengths : ["Some repository evidence detected"];
}

function buildSummary(parsed, scores, final, missing, strengths, criticalGaps, signals) {
  return [
    `OVERVIEW: This ${parsed.role} submission scored ${final}/100. Coverage is ${scores.coverage}/100, stack match is ${scores.stackMatch}/100, and implementation depth is ${scores.depth}/100.`,
    `STRENGTHS: ${strengths.join("; ")}.`,
    missing.length
      ? `REQUIREMENTS NEEDING VALIDATION: ${missing.slice(0, 8).join("; ")}.`
      : "REQUIREMENTS NEEDING VALIDATION: No major missing requirement was detected.",
    criticalGaps.length
      ? `CRITICAL HIRING RISKS: ${criticalGaps.join("; ")}.`
      : "CRITICAL HIRING RISKS: No critical knock-out issue was detected.",
    `EVIDENCE REVIEWED: README, repo tree, selected source files (${signals.fetched_file_paths.length}), and live URL evidence where present.`,
    final >= 75
      ? "RECOMMENDATION: Advance to technical interview and verify implementation ownership."
      : final >= 55
        ? "RECOMMENDATION: Proceed only with focused technical validation of the missing or weak areas."
        : "RECOMMENDATION: Do not advance unless the candidate can remediate the missing core requirements.",
  ].join("\n\n");
}

function ownerFromUrl(repoUrl) {
  return parseGithubUrl(repoUrl)?.owner ?? "candidate";
}

export async function evaluateRepo(repoUrl, assignmentText, notesText = "") {
  const parsed = parseAssignment(assignmentText);
  const signals = await fetchRepoSignals(repoUrl, notesText);
  const match = matchRequirements(parsed, signals);
  const coreMissing = match.missing.filter((item) => parsed.core_items.some((core) => displayRequirement(core) === item)).length;
  const secondaryMissing = match.missing.length - coreMissing;
  const missingGroups = new Set(
    match.missing
      .map((item) => parsed.core_items.find((core) => displayRequirement(core) === item))
      .filter(Boolean)
      .map(requirementCategory),
  );
  const roleMissing = roleEvidenceMissing(parsed, signals);

  const scores = {
    coverage: coverageScore(match.matched, parsed.required_items.length, coreMissing, secondaryMissing),
    stackMatch: stackMatchScore(parsed, signals),
    completeness: completenessScore(signals),
    depth: depthScore(signals),
    docs: docsScore(signals),
    demoReadiness: demoScore(signals),
    aiUsage: aiUsageScore(signals, notesText),
  };
  const cappedScore = capFinalScore(finalScore(scores), missingGroups.size, roleMissing);
  const verdict = verdictFromScore(cappedScore, scores, missingGroups.size);
  const criticalGaps = [
    ...match.missing.slice(0, 8).map((item) => `Missing: ${item}`),
    ...(roleMissing ? ["Role-defining implementation evidence is missing"] : []),
  ];
  const red_flags = [
    ...(missingGroups.size > 0 ? [`Missing ${missingGroups.size} core requirement group(s)`] : []),
    ...(roleMissing ? ["Role-defining evidence missing"] : []),
  ];
  const strengths = buildStrengths(scores, signals);
  const timestamp = Date.now() * 1_000_000;
  const result = {
    project_type: parsed.role,
    alignment: alignmentFromScore(cappedScore),
    scores,
    final_score: cappedScore,
    missing_items: match.missing,
    red_flags,
    summary: buildSummary(parsed, scores, cappedScore, match.missing, strengths, criticalGaps, signals),
    cached: false,
    timestamp,
    recruiter_verdict: {
      verdict,
      emoji: verdict === "pass" ? "PASS" : verdict === "caution" ? "CAUTION" : "FAIL",
      why:
        verdict === "pass"
          ? `This candidate scored ${cappedScore}/100 and clears the deterministic score and core requirement bars.`
          : verdict === "caution"
            ? `This candidate scored ${cappedScore}/100 but needs targeted validation before a hiring recommendation.`
            : `This candidate scored ${cappedScore}/100 and does not clear the deterministic hiring bar.`,
      technical_debt: cappedScore >= 75 ? "Production Ready" : cappedScore >= 55 ? "Needs Work" : "Prototype Grade",
      strengths,
      criticalGaps,
    },
    applied_instructions: [
      ...(signals.has_working_demo_link ? ["Verified live URL evidence"] : []),
      ...(signals.fetched_file_paths.length ? [`Source files reviewed: ${signals.fetched_file_paths.length}`] : []),
    ],
    strengths,
    criticalGaps,
  };

  return {
    id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    owner: ownerFromUrl(repoUrl),
    repo_url: repoUrl,
    assignment_text: assignmentText,
    result,
    timestamp,
  };
}

export function roleStatsFromHistory(history) {
  const grouped = new Map();
  for (const record of history) {
    const role = record.result.project_type || "General";
    const entry = grouped.get(role) ?? {
      role,
      count: 0,
      sum: 0,
      min_score: 100,
      max_score: 0,
      coverage: 0,
      stack: 0,
      completeness: 0,
      depth: 0,
      docs: 0,
      demo: 0,
      ai: 0,
    };
    entry.count += 1;
    entry.sum += record.result.final_score;
    entry.min_score = Math.min(entry.min_score, record.result.final_score);
    entry.max_score = Math.max(entry.max_score, record.result.final_score);
    entry.coverage += record.result.scores.coverage;
    entry.stack += record.result.scores.stackMatch;
    entry.completeness += record.result.scores.completeness;
    entry.depth += record.result.scores.depth;
    entry.docs += record.result.scores.docs;
    entry.demo += record.result.scores.demoReadiness;
    entry.ai += record.result.scores.aiUsage;
    grouped.set(role, entry);
  }
  return [...grouped.values()].map((entry) => ({
    role: entry.role,
    count: entry.count,
    avg_score: Math.round(entry.sum / entry.count),
    min_score: entry.min_score,
    max_score: entry.max_score,
    avg_coverage: Math.round(entry.coverage / entry.count),
    avg_stack_match: Math.round(entry.stack / entry.count),
    avg_completeness: Math.round(entry.completeness / entry.count),
    avg_depth: Math.round(entry.depth / entry.count),
    avg_docs: Math.round(entry.docs / entry.count),
    avg_demo: Math.round(entry.demo / entry.count),
    avg_ai_usage: Math.round(entry.ai / entry.count),
  }));
}
