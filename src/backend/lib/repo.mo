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

  // ── signal extraction ─────────────────────────────────────────────────────

  /// Extract repo signals from raw README text and a flat file-path list.
  public func extractSignals(
    readmeText : Text,
    filePaths  : [Text],
  ) : Types.RepoSignals {
    let wc = wordCount(readmeText);

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
      has_demo_link     = hasDemoLink(readmeText);
      has_ai_log        = hasAiLog(filePaths);
      readme_word_count = wc;
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
