import Types "../types/common";
import Text   "mo:core/Text";
import Array  "mo:core/Array";
import Iter   "mo:core/Iter";

/// Pure, stateless functions for fetching and parsing GitHub repo data.
/// All HTTP outcalls are delegated to the caller (main.mo / mixin).
module {

  /// Build the GitHub API URL for the repo's README (raw content).
  public func readmeUrl(owner : Text, repo : Text) : Text {
    "https://api.github.com/repos/" # owner # "/" # repo # "/readme";
  };

  /// Build the GitHub API URL for the repo's git tree (recursive).
  public func treeUrl(owner : Text, repo : Text) : Text {
    "https://api.github.com/repos/" # owner # "/" # repo # "/git/trees/HEAD?recursive=1";
  };

  /// Parse owner and repo name from a GitHub URL.
  /// Handles https://github.com/owner/repo and github.com/owner/repo
  /// Returns ?(owner, repo) or null if the URL is unrecognised.
  public func parseGithubUrl(url : Text) : ?(Text, Text) {
    // Normalise: strip trailing slash
    let stripped = if (url.endsWith(#text "/")) {
      switch (url.stripEnd(#text "/")) {
        case (?s) s;
        case null url;
      };
    } else url;

    // Remove protocol prefix
    let noProto = if (stripped.startsWith(#text "https://")) {
      switch (stripped.stripStart(#text "https://")) { case (?s) s; case null stripped };
    } else if (stripped.startsWith(#text "http://")) {
      switch (stripped.stripStart(#text "http://")) { case (?s) s; case null stripped };
    } else stripped;

    // Must start with github.com/
    if (not noProto.startsWith(#text "github.com/")) return null;
    let path = switch (noProto.stripStart(#text "github.com/")) {
      case (?s) s;
      case null return null;
    };

    // Split on '/' — we need exactly owner and repo (ignore sub-paths)
    let parts = path.split(#char '/').toArray();
    if (parts.size() < 2) return null;
    let owner = parts[0];
    // strip any .git suffix from repo name
    let rawRepo = parts[1];
    let repoName = switch (rawRepo.stripEnd(#text ".git")) {
      case (?s) s;
      case null rawRepo;
    };
    if (owner.size() == 0 or repoName.size() == 0) return null;
    ?(owner, repoName);
  };

  // ── internal helpers ─────────────────────────────────────────────────────

  func pathLower(p : Text) : Text = p.toLower();

  func anyPath(paths : [Text], predicate : Text -> Bool) : Bool {
    paths.any(func(p) { predicate(pathLower(p)) });
  };

  func containsAny(haystack : Text, needles : [Text]) : Bool {
    let lower = haystack.toLower();
    needles.any(func(n) { lower.contains(#text n) });
  };

  /// Count non-overlapping occurrences of needle in haystack.
  func countOccurrences(haystack : Text, needle : Text) : Nat {
    let parts = haystack.split(#text needle).toArray();
    if (parts.size() <= 1) 0 else parts.size() - 1
  };

  // ── signal extraction ─────────────────────────────────────────────────────

  /// Build the raw content URL for a specific file in a GitHub repo.
  public func rawFileUrl(owner : Text, repo : Text, path : Text) : Text {
    "https://raw.githubusercontent.com/" # owner # "/" # repo # "/HEAD/" # path;
  };

  /// Given a flat list of file paths, select priority source files to fetch (max 8 total).
  /// Priority order: package.json, entry files, Dockerfile, .env.example, test files, top src files.
  public func selectFilesToFetch(filePaths : [Text]) : [Text] {
    var selected : [Text] = [];
    let pl = filePaths.map(func(p) { p.toLower() });

    // Helper: add first match from candidates that exists in paths
    func addFirst(candidates : [Text]) {
      label search for (c in candidates.values()) {
        let cl = c.toLower();
        let idx = pl.findIndex(func(p) { p == cl or p.endsWith(#text ("/" # cl)) });
        switch idx {
          case (?i) {
            selected := selected.concat([filePaths[i]]);
            break search;
          };
          case null {};
        };
      };
    };

    // 1. package.json (highest priority)
    addFirst(["package.json"]);
    // 2. Entry point files
    addFirst(["src/index.ts", "src/main.ts", "src/app.ts", "server.ts", "src/server.ts",
              "src/index.js", "src/main.js", "src/app.js", "server.js", "index.ts",
              "app.ts", "index.js", "main.py", "app.py", "main.go"]);
    // 3. Dockerfile
    addFirst(["Dockerfile", "dockerfile"]);
    // 4. .env.example
    addFirst([".env.example", ".env.sample", "env.example"]);
    // 5–6: Up to 2 test files
    var testCount = 0;
    for (p in filePaths.values()) {
      if (testCount >= 2) ();
      let pl2 = p.toLower();
      if ((pl2.contains(#text ".test.") or pl2.contains(#text ".spec.")) and
          not selected.any(func(s) { s == p })) {
        selected := selected.concat([p]);
        testCount += 1;
      };
    };
    // 7–8: Up to 2 significant src files not yet selected
    var srcCount = 0;
    for (p in filePaths.values()) {
      if (srcCount >= 2) ();
      let pl2 = p.toLower();
      let isSource = (pl2.endsWith(#text ".ts") or pl2.endsWith(#text ".js") or
                      pl2.endsWith(#text ".tsx") or pl2.endsWith(#text ".jsx") or
                      pl2.endsWith(#text ".py") or pl2.endsWith(#text ".go") or
                      pl2.endsWith(#text ".java") or pl2.endsWith(#text ".rb")) and
                     (pl2.contains(#text "src/") or pl2.contains(#text "app/") or
                      pl2.contains(#text "lib/") or pl2.contains(#text "controllers/") or
                      pl2.contains(#text "routes/") or pl2.contains(#text "components/"));
      if (isSource and not selected.any(func(s) { s == p })) {
        selected := selected.concat([p]);
        srcCount += 1;
      };
    };
    selected;
  };

  /// Parse package.json content to extract framework names.
  public func parseFrameworks(pkgJson : Text) : [Text] {
    // Look for known framework/library names in the dependencies section
    let knownFrameworks : [Text] = [
      "react", "vue", "angular", "svelte", "next", "nuxt", "gatsby", "remix",
      "express", "fastify", "koa", "hapi", "nest", "nestjs",
      "django", "flask", "fastapi", "rails", "laravel", "spring",
      "tailwindcss", "vite", "webpack", "parcel", "rollup",
      "prisma", "mongoose", "sequelize", "typeorm",
      "jest", "vitest", "mocha", "jasmine", "pytest",
      "typescript", "graphql", "redux", "zustand", "mobx"
    ];
    let lower = pkgJson.toLower();
    knownFrameworks.filter(func(fw) { lower.contains(#text fw) });
  };

  /// Count TODO/FIXME occurrences in source file content.
  public func countTodosInSource(content : Text) : Nat {
    let lower = content.toLower();
    countOccurrences(lower, "todo") + countOccurrences(lower, "fixme");
  };

  /// Count test function occurrences (it/test/describe blocks) in test file content.
  public func countTests(content : Text) : Nat {
    let lower = content.toLower();
    // Match "it(", "test(", "describe(", "def test_", "func Test"
    countOccurrences(lower, "it(") +
    countOccurrences(lower, "test(") +
    countOccurrences(lower, "describe(") +
    countOccurrences(lower, "def test_") +
    countOccurrences(lower, "func test");
  };

  /// Check if a Dockerfile uses multi-stage builds.
  public func isMultistageDockerfile(content : Text) : Bool {
    let lower = content.toLower();
    // Multi-stage = more than one FROM instruction
    countOccurrences(lower, "\nfrom ") + countOccurrences(lower, "\nFROM ") >= 2 or
    countOccurrences(lower, "from ") >= 2;
  };

  /// Check if package.json has start or dev scripts.
  public func hasStartScripts(pkgJson : Text) : Bool {
    let lower = pkgJson.toLower();
    lower.contains(#text "\"start\"") or lower.contains(#text "\"dev\"") or
    lower.contains(#text "'start'") or lower.contains(#text "'dev'");
  };

  /// Build a short summary for a given file based on its content.
  public func buildFileSummary(path : Text, content : Text) : Text {
    let pl = path.toLower();
    let _firstLine = switch (content.split(#char '\n').next()) {
      case (?l) l.trim(#char ' ');
      case null "";
    };
    let size = content.size();
    if (pl.endsWith(#text "package.json")) {
      let frameworks = parseFrameworks(content);
      if (frameworks.size() > 0) {
        "package.json — frameworks: " # frameworks.values().join(", ");
      } else {
        "package.json (" # size.toText() # " bytes)"
      };
    } else if (pl.contains(#text "dockerfile")) {
      if (isMultistageDockerfile(content)) "Dockerfile (multi-stage, production-grade)"
      else "Dockerfile (single-stage)";
    } else if (pl.endsWith(#text ".env.example") or pl.endsWith(#text ".env.sample")) {
      let lines = content.split(#char '\n').toArray().size();
      ".env.example (" # lines.toText() # " config keys documented)";
    } else if (pl.contains(#text ".test.") or pl.contains(#text ".spec.")) {
      let tc = countTests(content);
      path # " (" # tc.toText() # " test cases detected)";
    } else {
      let todos = countTodosInSource(content);
      let note = if (todos > 0) " — " # todos.toText() # " TODOs" else "";
      path # " (" # size.toText() # " bytes" # note # ")";
    };
  };

  /// Extract repo signals from raw README text and a flat file-path list.
  public func extractSignals(
    readmeText : Text,
    filePaths  : [Text],
  ) : Types.RepoSignals {
    let wc = wordCount(readmeText);
    let fc = filePaths.size();

    // Count TODO/FIXME occurrences across file paths (path names can contain hints,
    // but more importantly we scan the readme for TODO markers)
    let readmeLower = readmeText.toLower();
    let todoInReadme : Nat = countOccurrences(readmeLower, "todo") + countOccurrences(readmeLower, "fixme");
    // Also check file path names for common todo/fixme patterns
    let todoInPaths : Nat = filePaths.foldLeft<Text, Nat>(0, func(acc, p) {
      let pl = pathLower(p);
      if (pl.contains(#text "todo") or pl.contains(#text "fixme")) acc + 1 else acc
    });
    let todoCount = todoInReadme + todoInPaths;

    // Estimate error handler count from readme mentions
    let errorHandlerCount : Nat =
      countOccurrences(readmeLower, "error handling") +
      countOccurrences(readmeLower, "try/catch") +
      countOccurrences(readmeLower, "exception") +
      (if (anyPath(filePaths, func(p) { p.contains(#text "middleware/error") or p.contains(#text "error.handler") or p.contains(#text "errorhandler") })) 2 else 0) +
      (if (anyPath(filePaths, func(p) { p.contains(#text "catch") or p.contains(#text "error") })) 1 else 0);

    {
      readme_text       = readmeText;
      file_tree         = filePaths;
      has_dockerfile    = anyPath(filePaths, func(p) {
        p == "dockerfile" or p.startsWith(#text "dockerfile")
      });
      has_compose       = anyPath(filePaths, func(p) {
        p.contains(#text "docker-compose") or p.contains(#text "compose.yml") or p.contains(#text "compose.yaml")
      });
      has_ci            = anyPath(filePaths, func(p) {
        p.contains(#text ".github/workflows") or p.contains(#text ".circleci") or p.contains(#text ".gitlab-ci") or p.contains(#text "jenkinsfile")
      });
      has_terraform     = anyPath(filePaths, func(p) {
        p.endsWith(#text ".tf") or p.endsWith(#text ".tfvars") or p.contains(#text "cloudformation") or p.contains(#text "template.yaml") or p.contains(#text "template.yml")
      });
      has_backend       = anyPath(filePaths, func(p) {
        p.endsWith(#text ".py") or p.endsWith(#text ".go") or p.endsWith(#text ".rs") or
        p.endsWith(#text ".java") or p.endsWith(#text ".rb") or p.endsWith(#text ".php") or
        p.contains(#text "server.js") or p.contains(#text "app.js") or p.contains(#text "index.js") or
        p.contains(#text "server.ts") or p.contains(#text "app.ts") or p.contains(#text "routes/") or
        p.contains(#text "controllers/") or p.contains(#text "handlers/") or p.contains(#text "api/")
      });
      has_frontend      = anyPath(filePaths, func(p) {
        p.endsWith(#text ".jsx") or p.endsWith(#text ".tsx") or p.endsWith(#text ".vue") or
        p.endsWith(#text ".svelte") or p.contains(#text "components/") or p.contains(#text "pages/") or
        p.contains(#text "src/app") or p.contains(#text "public/index.html") or p.contains(#text "index.html")
      });
      has_auth          = anyPath(filePaths, func(p) {
        p.contains(#text "auth") or p.contains(#text "login") or p.contains(#text "jwt") or
        p.contains(#text "oauth") or p.contains(#text "passport") or p.contains(#text "session")
      }) or containsAny(readmeText, ["authentication", "login", "jwt", "oauth", "auth"]);
      has_db_config     = anyPath(filePaths, func(p) {
        p.contains(#text "schema.") or p.contains(#text "migration") or p.contains(#text ".sql") or
        p.contains(#text "prisma") or p.contains(#text "sequelize") or p.contains(#text "mongoose") or
        p.contains(#text "db.") or p.contains(#text "database") or p.contains(#text ".env")
      });
      has_api_routes    = anyPath(filePaths, func(p) {
        p.contains(#text "routes") or p.contains(#text "router") or p.contains(#text "endpoints") or
        p.contains(#text "api/v") or p.contains(#text "swagger") or p.contains(#text "openapi")
      });
      has_demo_link       = hasDemoLink(readmeText);
      has_working_demo_link = false;  // default false — verified by async HTTP call in evaluation-api.mo
      demo_url            = extractDemoUrl(readmeText);
      has_ai_log          = hasAiLog(filePaths);
      readme_word_count = wc;
      // Extended signals
      todo_count          = todoCount;
      has_env_example     = anyPath(filePaths, func(p) {
        p.contains(#text ".env.example") or p.contains(#text ".env.sample") or
        p.contains(#text ".env.template") or p.contains(#text "env.example")
      });
      has_seed_data       = anyPath(filePaths, func(p) {
        p.contains(#text "seeds/") or p.contains(#text "seed.sql") or
        p.contains(#text "seed.js") or p.contains(#text "seed.ts") or
        p.contains(#text "seeders/") or p.contains(#text "fixtures/") or
        p.contains(#text "seed_data") or p.contains(#text "initial_data")
      });
      has_setup_script    = anyPath(filePaths, func(p) {
        p == "makefile" or p.endsWith(#text "/makefile") or
        p.contains(#text "setup.sh") or p.contains(#text "start.sh") or
        p.contains(#text "install.sh") or p.contains(#text "run.sh") or
        p.contains(#text "bootstrap.sh")
      });
      error_handler_count = errorHandlerCount;
      file_count          = fc;
      // Deep crawl signals — defaults; populated by evaluation-api mixin after HTTP fetches
      detected_frameworks   = [];
      todo_count_source     = 0;
      test_count            = 0;
      has_dockerfile_multistage = false;
      has_scripts           = false;
      fetched_file_paths    = [];
      key_file_summaries    = [];
    };
  };

  /// Detect whether a demo link is present in the README text.
  public func hasDemoLink(readmeText : Text) : Bool {
    containsAny(readmeText, [
      "demo:", "live demo", "live at", "deployed at", "hosted at",
      "see it live", "view demo", "demo link", "online demo",
      "vercel.app", "netlify.app", "heroku", "railway.app",
      "render.com", "fly.dev", "github.io", "surge.sh"
    ]);
  };

  /// Extract the first demo URL found in the README text.
  /// Looks for HTTP/HTTPS URLs near demo-related keywords.
  /// Returns null if no demo URL is found.
  public func extractDemoUrl(readmeText : Text) : ?Text {
    let _lower = readmeText.toLower();
    // Common demo hosting domains to scan for
    let demoHosts : [Text] = [
      "vercel.app", "netlify.app", "heroku", "railway.app",
      "render.com", "fly.dev", "github.io", "surge.sh",
      "pages.dev", "azurestaticapps.net", "web.app"
    ];
    // Scan README lines for any that contain a demo host URL
    let lines = readmeText.split(#char '\n').toArray();
    for (line in lines.values()) {
      let lineLower = line.toLower();
      // Check if this line contains a demo host
      let hasDemoHost = demoHosts.any(func(host) { lineLower.contains(#text host) });
      if (hasDemoHost) {
        // Extract the first https?:// URL from this line
        let tokens = line.split(#char ' ').toArray();
        for (token in tokens.values()) {
          let t = token.trim(#predicate(func(c : Char) : Bool {
            c == '(' or c == ')' or c == '[' or c == ']' or c == '<' or c == '>' or c == '\"'
          }));
          if (t.startsWith(#text "https://") or t.startsWith(#text "http://")) {
            return ?t;
          };
        };
      };
    };
    // Fallback: scan for any https URL that ends with a demo-hosting domain
    let tokens = readmeText.split(#char ' ').toArray();
    for (token in tokens.values()) {
      let t = token.trim(#predicate(func(c : Char) : Bool {
        c == '(' or c == ')' or c == '[' or c == ']' or c == '<' or c == '>' or c == '\"' or c == '\n' or c == '\r'
      }));
      if (t.startsWith(#text "https://") or t.startsWith(#text "http://")) {
        let tl = t.toLower();
        let isDemoHost = demoHosts.any(func(host) { tl.contains(#text host) });
        if (isDemoHost) return ?t;
      };
    };
    null;
  };

  /// Detect whether an AI log file exists among the file paths.
  public func hasAiLog(filePaths : [Text]) : Bool {
    anyPath(filePaths, func(p) {
      p.contains(#text "ai_log") or p.contains(#text "ai-log") or
      p.contains(#text "ailog") or p.contains(#text "chatgpt") or
      p.contains(#text "gpt_log") or p.contains(#text "prompt_log") or
      p == "ai_usage.md" or p == "ai_usage.txt" or p == "ai_log.md" or p == "ai_log.txt"
    });
  };

  /// Count words in a block of text (for docs scoring).
  public func wordCount(text : Text) : Nat {
    // Split on whitespace chars and count non-empty tokens
    let tokens = text.split(#predicate(func(c : Char) : Bool {
      c == ' ' or c == '\n' or c == '\t' or c == '\r'
    }));
    tokens.foldLeft<Text, Nat>(0, func(acc, tok) {
      if (tok.size() > 0) acc + 1 else acc
    });
  };
};
