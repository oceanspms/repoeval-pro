import Types       "../types/common";
import Repo        "../lib/repo";
import Scoring     "../lib/scoring";
import Instructions "../lib/instruction-parser";
import Map         "mo:core/Map";
import Array       "mo:core/Array";
import Text        "mo:core/Text";
import Char        "mo:core/Char";
import Time        "mo:core/Time";
import Int         "mo:core/Int";
import Nat         "mo:core/Nat";
import Debug       "mo:core/Debug";
import OutCall     "mo:caffeineai-http-outcalls/outcall";

/// Mixin: exposes the public evaluation API.
/// Receives injected state: evalCache, assignmentCache, lastCacheHit, historyStore, and evalCounter.
mixin (
  evalCache       : Map.Map<Types.CacheKey, Types.EvaluationResult>,
  assignmentCache : Map.Map<Types.CacheKey, Types.ParsedAssignment>,
  lastCacheHit    : { var value : Bool },
  historyStore    : Map.Map<Text, Types.EvaluationRecord>,
  evalCounter     : { var value : Nat },
) {

  let MAX_REPOS_PER_EVALUATION : Nat = 5;
  let MAX_ASSIGNMENT_CHARS : Nat = 20_000;
  let MAX_NOTES_CHARS : Nat = 20_000;

  // ── IC HTTP outcall transform ─────────────────────────────────────────────

  /// Required transform callback for IC HTTP outcalls (strips response headers).
  public query func transform(
    input : OutCall.TransformationInput
  ) : async OutCall.TransformationOutput {
    OutCall.transform(input);
  };

  // ── internal: GitHub API helpers ─────────────────────────────────────────

  /// Fetch raw README text from GitHub API.
  /// Returns "" on error (non-fatal).
  func fetchReadme(owner : Text, repo : Text) : async Text {
    let rawUrl = "https://raw.githubusercontent.com/" # owner # "/" # repo # "/HEAD/README.md";
    try {
      await OutCall.httpGetRequest(rawUrl, [
        { name = "User-Agent"; value = "RepoEval-Pro/1.0" }
      ], transform);
    } catch _ { "" };
  };

  /// Fetch recursive git tree from GitHub API and extract flat path list.
  /// Returns [] on error.
  func fetchTree(owner : Text, repo : Text) : async [Text] {
    let url = Repo.treeUrl(owner, repo);
    let raw = try {
      await OutCall.httpGetRequest(url, [
        { name = "User-Agent"; value = "RepoEval-Pro/1.0" },
        { name = "Accept";     value = "application/vnd.github.v3+json" }
      ], transform);
    } catch _ { "" };
    parsePathsFromTreeJson(raw);
  };

  /// Minimal JSON path extractor for GitHub tree API response.
  func parsePathsFromTreeJson(json : Text) : [Text] {
    let parts = json.split(#text "\"path\":\"").toArray();
    if (parts.size() <= 1) return [];
    parts.sliceToArray(1, parts.size()).filterMap(func(segment) {
      let subParts = segment.split(#text "\"").toArray();
      if (subParts.size() == 0) null
      else if (subParts[0].size() == 0) null
      else ?(subParts[0]);
    });
  };

  // ── internal: URL content fetching ───────────────────────────────────────

  /// Detect if a text token looks like an HTTP/HTTPS URL.
  func isUrl(token : Text) : Bool {
    token.startsWith(#text "https://") or token.startsWith(#text "http://");
  };

  /// Minimal HTML tag stripper — removes everything between < and >.
  func stripHtmlTags(html : Text) : Text {
    var out    = "";
    var inTag  = false;
    for (c in html.toIter()) {
      if (c == '<') {
        inTag := true;
      } else if (c == '>') {
        inTag := false;
        out #= " "; // replace closing > with a space for readability
      } else if (not inTag) {
        out #= Text.fromChar(c);
      };
    };
    out;
  };

  /// Fetch and return plain text for a given URL.
  /// Handles:
  ///   1. Google Docs — export as plain text
  ///   2. GitHub repo — fetch README via raw.githubusercontent.com
  ///   3. Notion — fetch page HTML and strip tags
  /// Returns "" on error or unsupported URL.
  func fetchUrlText(url : Text) : async Text {
    // 1. Google Docs
    if (url.startsWith(#text "https://docs.google.com/")) {
      let exportUrl = if (url.contains(#text "/export")) {
        url
      } else {
        let parts = url.split(#char '?').toArray();
        let base = if (parts.size() > 0) parts[0] else url;
        (if (base.endsWith(#text "/")) base else base # "/") # "export?format=txt";
      };
      let raw = try {
        await OutCall.httpGetRequest(exportUrl, [
          { name = "User-Agent"; value = "RepoEval-Pro/1.0" }
        ], transform);
      } catch _ { "" };
      return raw.trim(#char ' ');
    };

    // 2. GitHub repo URL — fetch the README
    if (url.contains(#text "github.com/")) {
      switch (Repo.parseGithubUrl(url)) {
        case (?(owner, repoName)) {
          let readmeUrl = "https://raw.githubusercontent.com/" # owner # "/" # repoName # "/main/README.md";
          let raw = try {
            await OutCall.httpGetRequest(readmeUrl, [
              { name = "User-Agent"; value = "RepoEval-Pro/1.0" }
            ], transform);
          } catch _ { "" };
          if (raw.size() > 0) return raw;
          // fallback: try HEAD branch
          let rawHead = "https://raw.githubusercontent.com/" # owner # "/" # repoName # "/HEAD/README.md";
          let raw2 = try {
            await OutCall.httpGetRequest(rawHead, [
              { name = "User-Agent"; value = "RepoEval-Pro/1.0" }
            ], transform);
          } catch _ { "" };
          return raw2;
        };
        case null {};
      };
    };

    // 3. Notion
    if (url.contains(#text "notion.so/") or url.contains(#text "notion.site/")) {
      let raw = try {
        await OutCall.httpGetRequest(url, [
          { name = "User-Agent"; value = "RepoEval-Pro/1.0" }
        ], transform);
      } catch _ { "" };
      if (raw.size() > 0) {
        let stripped = stripHtmlTags(raw);
        // Truncate to MAX_NOTES
        let maxN : Nat = 10_000;
        if (stripped.size() > maxN) {
          let chars = stripped.toArray();
          let kept = Array.tabulate(maxN, func(idx : Nat) : Char { chars[idx] });
          return Text.fromArray(kept);
        };
        return stripped;
      };
    };

    ""; // unrecognised or failed
  };

  /// Scan notes text for embedded URLs (lines or tokens starting with http/https),
  /// fetch their content, and return an enriched notes string.
  /// Lines that are only URLs are replaced by the fetched content.
  /// Non-URL content is preserved as-is.
  func expandUrlsInNotes(notesText : Text) : async Text {
    var result = "";
    let lines = notesText.split(#char '\n').toArray();
    for (line in lines.values()) {
      let trimmed = line.trim(#char ' ');
      if (isUrl(trimmed)) {
        // entire line is a URL — fetch and inline
        let fetched = await fetchUrlText(trimmed);
        if (fetched.size() > 0) {
          result #= "\n[From " # trimmed # "]\n" # fetched # "\n";
        } else {
          result #= line # "\n";
        };
      } else {
        // Check tokens in the line for embedded URLs
        let tokens = trimmed.split(#char ' ').toArray();
        var lineOut = "";
        for (token in tokens.values()) {
          if (isUrl(token)) {
            let fetched = await fetchUrlText(token);
            if (fetched.size() > 0) {
              lineOut #= " [From " # token # ": " # fetched # "]";
            } else {
              lineOut #= " " # token;
            };
          } else {
            lineOut #= " " # token;
          };
        };
        result #= lineOut.trim(#char ' ') # "\n";
      };
    };
    result;
  };

  // ── internal: deterministic assignment parsing ───────────────────────────

  /// Parse an assignment into { role, required_items } using deterministic heuristics.
  /// No external LLM/API key is required; the same assignment text produces the same rubric.
  /// Notes are used later as evidence; the assignment text alone defines the rubric.
  func parseAssignment(assignmentText : Text, notes : ?Text) : async Types.ParsedAssignment {
    let _notesIgnoredForRubric = notes;
    parseParsedAssignment("", assignmentText);
  };

  func truncateText(input : Text, maxChars : Nat) : Text {
    if (input.size() <= maxChars) return input;
    let chars = input.toArray();
    let kept = Array.tabulate(maxChars, func(idx : Nat) : Char { chars[idx] });
    Text.fromArray(kept);
  };

  func errorResult(summaryText : Text, redFlags : [Text]) : Types.EvaluationResult {
    {
      project_type          = "Error";
      alignment             = #Low;
      scores                = { coverage = 0; stackMatch = 0; completeness = 0; depth = 0; docs = 0; demoReadiness = 0; aiUsage = 0 };
      final_score           = 0;
      missing_items         = [];
      red_flags             = redFlags;
      summary               = summaryText;
      cached                = false;
      timestamp             = Time.now();
      recruiter_verdict     = null;
      applied_instructions  = [];
      strengths             = [];
      criticalGaps          = redFlags;
    };
  };

  /// Parse AI response JSON into ParsedAssignment.
  /// Falls back to heuristic extraction from the raw assignment text when the AI
  /// response is empty, malformed, or returns no items.
  func parseParsedAssignment(json : Text, assignmentText : Text) : Types.ParsedAssignment {
    let role : Text = switch (extractJsonStringField(json, "role")) {
      case (?r) {
        let rl = r.toLower();
        let al = assignmentText.toLower();
        let strongFrontend =
          al.contains(#text "react") or al.contains(#text "vue") or al.contains(#text "angular") or
          al.contains(#text "svelte") or al.contains(#text "tailwind") or al.contains(#text "html/css") or
          al.contains(#text "ui/ux") or al.contains(#text "component") or
          al.contains(#text "responsive") or al.contains(#text "web design") or
          al.contains(#text "frontend") or al.contains(#text "front-end") or
          al.contains(#text "landing page") or al.contains(#text "user interface") or
          al.contains(#text "figma");
        let strongBackend =
          al.contains(#text "express") or al.contains(#text "django") or al.contains(#text "fastapi") or
          al.contains(#text "postgresql") or al.contains(#text "mongodb") or
          al.contains(#text "node.js server") or al.contains(#text "rest api server") or
          al.contains(#text "graphql server") or al.contains(#text "database schema") or
          al.contains(#text "backend");
        if (strongFrontend and not strongBackend) "Frontend"
        else if (strongFrontend and strongBackend) "Fullstack"
        else if (rl.contains(#text "devops"))    "DevOps"
        else if (rl.contains(#text "fullstack") or rl.contains(#text "full")) "Fullstack"
        else if (rl.contains(#text "backend"))   "Backend"
        else if (rl.contains(#text "frontend"))  "Frontend"
        else if (rl.contains(#text "mobile"))    "Mobile"
        else if (rl.contains(#text "qa"))        "QA"
        else if (rl.contains(#text "ml") or rl.contains(#text "machine learning")) "ML"
        else r;
      };
      case null {
        // Heuristic fallback — check assignment text for keywords
        let al = assignmentText.toLower();
        // Priority 1: explicit role labels
        if (al.contains(#text "devops") or al.contains(#text "terraform") or
            al.contains(#text "kubernetes") or
            (al.contains(#text "ci/cd") and al.contains(#text "deploy"))) {
          "DevOps"
        } else if (al.contains(#text "fullstack") or al.contains(#text "full-stack") or al.contains(#text "full stack")) {
          "Fullstack"
        } else if (al.contains(#text "mobile") or al.contains(#text "react native") or al.contains(#text "flutter")) {
          "Mobile"
        } else if (al.contains(#text "machine learning") or al.contains(#text " ml ") or al.contains(#text "deep learning") or al.contains(#text "nlp") or al.contains(#text "data science")) {
          "ML"
        } else {
          // Priority 2: detect frontend vs backend via technology keywords
          // Frontend keywords (UI/visual/component layer)
          let hasFrontend : Bool =
            al.contains(#text "react") or al.contains(#text "vue") or al.contains(#text "angular") or
            al.contains(#text "svelte") or al.contains(#text "next.js") or al.contains(#text "gatsby") or
            al.contains(#text "tailwind") or al.contains(#text "styled-component") or
            al.contains(#text "html/css") or al.contains(#text "html and css") or
            al.contains(#text "ui/ux") or al.contains(#text " ux ") or al.contains(#text "component") or
            al.contains(#text "responsive") or al.contains(#text "web design") or
            al.contains(#text "frontend") or al.contains(#text "front-end") or al.contains(#text "front end") or
            al.contains(#text "landing page") or al.contains(#text "dashboard ui") or
            al.contains(#text "user interface") or al.contains(#text "user experience") or
            al.contains(#text "pixel") or al.contains(#text "design system") or
            al.contains(#text "animation") or al.contains(#text "figma") or
            // standalone CSS/HTML signal — only if no strong backend present
            (al.contains(#text "css") and not al.contains(#text "express") and not al.contains(#text "server")) or
            (al.contains(#text " ui ") and not al.contains(#text "express") and not al.contains(#text "backend"));
          // Backend keywords (server/data/API layer)
          // NOTE: bare "api" alone is NOT enough to classify as backend — many frontend
          // assignments call third-party APIs. Need server/database context.
          let hasBackend : Bool =
            al.contains(#text "express") or al.contains(#text "django") or al.contains(#text "fastapi") or
            al.contains(#text "flask") or al.contains(#text "spring boot") or al.contains(#text "rails") or
            al.contains(#text "laravel") or al.contains(#text "graphql server") or
            al.contains(#text "rest api server") or al.contains(#text "build an api") or
            al.contains(#text "build a rest") or al.contains(#text "build rest") or
            al.contains(#text "node.js server") or al.contains(#text "nodejs server") or
            al.contains(#text "postgresql") or al.contains(#text "mongodb") or al.contains(#text "microservice") or
            (al.contains(#text "api") and al.contains(#text "server") and not hasFrontend) or
            (al.contains(#text "api") and al.contains(#text "database") and not hasFrontend) or
            (al.contains(#text "backend") and not al.contains(#text "frontend")) or
            al.contains(#text "back-end");
          if (hasFrontend and hasBackend) "Fullstack"
          else if (hasFrontend) "Frontend"
          else if (hasBackend) "Backend"
          else if (al.contains(#text "backend") or (al.contains(#text "api") and al.contains(#text "endpoint"))) "Backend"
          else "General";
        };
      };
    };

    let aiItems : ?[Text] = extractJsonArray(json, "required_items");
    let aiCore  : ?[Text] = extractJsonArray(json, "core_items");
    let aiSecondary : ?[Text] = extractJsonArray(json, "secondary_items");

    // If the AI returned non-empty items, use them directly.
    switch aiItems {
      case (?items) {
        if (items.size() > 0) {
          let coreItems = switch aiCore {
            case (?c) if (c.size() > 0) c else items;
            case null items;
          };
          let secondaryItems = switch aiSecondary {
            case (?s) s;
            case null [];
          };
          return { role; required_items = items; core_items = coreItems; secondary_items = secondaryItems };
        };
      };
      case null {};
    };

    // ── Heuristic fallback ────────────────────────────────────────────────────
    // AI response was empty, malformed, or returned no items.
    // Extract requirements from the raw assignment text.
    let heuristicItems = extractRequirementsHeuristic(assignmentText);

    // Classify heuristic items as core or secondary by simple heuristics:
    // Items with strong imperative verbs or "must" / "required" → core
    // Items with "optional", "bonus", "nice to have" → secondary
    let coreH = heuristicItems.filter(func(item) {
      let il = item.toLower();
      not (il.contains(#text "optional") or il.contains(#text "bonus") or
           il.contains(#text "nice to have") or il.contains(#text "if time") or
           il.contains(#text "extra"))
    });
    let secH = heuristicItems.filter(func(item) {
      let il = item.toLower();
      il.contains(#text "optional") or il.contains(#text "bonus") or
      il.contains(#text "nice to have") or il.contains(#text "if time") or
      il.contains(#text "extra")
    });

    { role; required_items = heuristicItems; core_items = coreH; secondary_items = secH };
  };

  /// Heuristic requirement extractor.
  /// Splits assignment text on newlines / bullet points / numbered lists
  /// to produce a list of non-empty requirement phrases.
  func extractRequirementsHeuristic(text : Text) : [Text] {
    // Normalise line endings
    let normalized = text.replace(#char '\r', "");
    let lines = normalized.split(#char '\n').toArray();
    let items = lines.filterMap(func(line) : ?Text {
      // Strip leading whitespace
      let trimmed = line.trim(#char ' ');
      // Strip common bullet/list prefixes: "- ", "* ", "• ", "1. ", "1) "
      let stripped = stripListPrefix(trimmed);
      let s = stripped.trim(#char ' ');
      // Skip empty lines, pure headers (##), short fragments, and lines that
      // are just punctuation.
      if (s.size() < 10) null
      else if (s.startsWith(#text "#")) null   // markdown header
      else if (s.startsWith(#text "==")) null  // setext header
      else if (s.startsWith(#text "---")) null // hr
      else if (s.startsWith(#text "**") and s.endsWith(#text "**") and s.size() < 40) null // bold-only label
      else ?s
    });
    // Deduplicate while preserving order
    var seen : [Text] = [];
    let deduped = items.filter(func(item) {
      if (seen.any(func(s) { s == item })) false
      else { seen := seen.concat([item]); true }
    });
    let enriched = if (deduped.size() < 2) {
      var merged = deduped;
      for (item in inferRequirementsFromKeywords(text).values()) {
        if (not merged.any(func(existing) { existing == item })) {
          merged := merged.concat([item]);
        };
      };
      merged;
    } else {
      deduped;
    };
    // Cap at 30 items to prevent runaway lists
    enriched.sliceToArray(0, Nat.min(30, enriched.size()));
  };

  func inferRequirementsFromKeywords(text : Text) : [Text] {
    let al = text.toLower();
    var out : [Text] = [];
    func add(reqLabel : Text) {
      if (not out.any(func(existing) { existing == reqLabel })) {
        out := out.concat([reqLabel]);
      };
    };
    if (al.contains(#text "react") or al.contains(#text "vue") or al.contains(#text "angular") or
        al.contains(#text "frontend") or al.contains(#text "front-end") or al.contains(#text "ui") or
        al.contains(#text "component")) add("Build the required frontend user interface");
    if (al.contains(#text "responsive") or al.contains(#text "mobile friendly") or al.contains(#text "mobile-first")) add("Implement responsive layout and mobile-friendly UI");
    if (al.contains(#text "api") or al.contains(#text "backend") or al.contains(#text "server") or
        al.contains(#text "endpoint")) add("Implement required backend or API functionality");
    if (al.contains(#text "auth") or al.contains(#text "login") or al.contains(#text "jwt") or
        al.contains(#text "oauth")) add("Implement authentication flow");
    if (al.contains(#text "database") or al.contains(#text "postgres") or al.contains(#text "mongodb") or
        al.contains(#text "mysql") or al.contains(#text "redis")) add("Implement required data persistence layer");
    if (al.contains(#text "test") or al.contains(#text "testing") or al.contains(#text "unit test")) add("Include tests for important flows");
    if (al.contains(#text "docker") or al.contains(#text "container")) add("Provide Docker or container setup");
    if (al.contains(#text "ci") or al.contains(#text "pipeline") or al.contains(#text "github action")) add("Provide CI pipeline configuration");
    if (al.contains(#text "readme") or al.contains(#text "documentation") or al.contains(#text "setup")) add("Document setup and usage instructions");
    if (al.contains(#text "demo") or al.contains(#text "deploy") or al.contains(#text "vercel") or
        al.contains(#text "netlify") or al.contains(#text "hosted")) add("Provide a runnable demo or deployment");
    if (out.size() == 0 and text.trim(#char ' ').size() >= 20) {
      add(text.trim(#char ' '));
    };
    out;
  };

  /// Strip common list prefixes from a line.
  func stripListPrefix(line : Text) : Text {
    // "- ", "* ", "+ ", "• "
    for (prefix in ["- ", "* ", "+ ", "• ", "· "].values()) {
      if (line.startsWith(#text prefix)) {
        switch (line.stripStart(#text prefix)) {
          case (?s) return s;
          case null {};
        };
      };
    };
    // Numbered list: "1. ", "10. ", "1) ", "10) "
    let chars = line.toArray();
    var i : Nat = 0;
    // consume leading digits
    while (i < chars.size() and chars[i] >= '0' and chars[i] <= '9') { i += 1 };
    if (i > 0 and i < chars.size()) {
      // must be followed by '. ' or ') '
      if ((chars[i] == '.' or chars[i] == ')') and i + 1 < chars.size() and chars[i + 1] == ' ') {
        let rest = Array.tabulate(chars.size() - i - 2, func(idx : Nat) : Char { chars[i + 2 + idx] });
        return Text.fromArray(rest);
      };
    };
    line;
  };

  /// Extract a JSON string field value by key.
  func extractJsonStringField(json : Text, key : Text) : ?Text {
    let needle = "\"" # key # "\":\"";
    let parts = json.split(#text needle).toArray();
    if (parts.size() <= 1) return null;
    let after = parts[1];
    let subParts = after.split(#text "\"").toArray();
    if (subParts.size() == 0) null
    else ?(subParts[0]);
  };

  /// Extract a JSON string array by key — returns the items as trimmed strings.
  func extractJsonArray(json : Text, key : Text) : ?[Text] {
    let needle = "\"" # key # "\":[";
    let parts = json.split(#text needle).toArray();
    if (parts.size() <= 1) return null;
    let after = parts[1];
    let bracketParts = after.split(#char ']').toArray();
    if (bracketParts.size() == 0) return null;
    let inner = bracketParts[0];
    let rawItems = inner.split(#char ',').toArray();
    let items = rawItems.filterMap(func(item) {
      let trimmed = item.trim(#predicate(func(c : Char) : Bool {
        c == ' ' or c == '\"' or c == '\n' or c == '\r' or c == '\t'
      }));
      if (trimmed.size() == 0) null else ?trimmed;
    });
    if (items.size() == 0) null else ?items;
  };

  // ── internal: owner extraction ────────────────────────────────────────────

  /// Extract the GitHub owner username from a repo URL.
  /// First tries Repo.parseGithubUrl; if that fails, falls back to a simple
  /// split on '/' to pull the segment after "github.com".
  func extractOwner(repoUrl : Text) : Text {
    switch (Repo.parseGithubUrl(repoUrl)) {
      case (?(owner, _)) {
        if (owner.size() > 0) owner
        else extractOwnerFallback(repoUrl);
      };
      case null { extractOwnerFallback(repoUrl) };
    };
  };

  /// Fallback: split URL on '/' and return index-3 segment (the owner segment).
  /// For "https://github.com/owner/repo" → ["https:", "", "github.com", "owner", "repo"]
  func extractOwnerFallback(repoUrl : Text) : Text {
    let parts = repoUrl.split(#char '/').toArray();
    // Index 3 is the owner for a full https://github.com/owner/repo URL
    if (parts.size() > 3 and parts[3].size() > 0) {
      parts[3];
    } else if (parts.size() > 1) {
      let nonEmpty = parts.filter(func(p) { p.size() > 0 });
      if (nonEmpty.size() >= 2) nonEmpty[nonEmpty.size() - 2]
      else repoUrl;
    } else {
      repoUrl;
    };
  };

  // ── internal: deep source-file crawling ────────────────────────────────

  /// Fetch the raw content of a single source file from GitHub.
  /// Returns "" on error or non-200 response.
  func fetchSourceFile(owner : Text, repo : Text, path : Text) : async Text {
    let url = "https://raw.githubusercontent.com/" # owner # "/" # repo # "/HEAD/" # path;
    try {
      await OutCall.httpGetRequest(url, [
        { name = "User-Agent"; value = "RepoEval-Pro/1.0" }
      ], transform);
    } catch _ { "" };
  };

  /// Return the first maxChars characters of content (caps at 6000).
  func truncateContent(content : Text, maxChars : Nat) : Text {
    let cap : Nat = if (maxChars > 6000) 6000 else maxChars;
    if (content.size() <= cap) return content;
    let chars = content.toArray();
    let kept = Array.tabulate(cap, func(idx : Nat) : Char { chars[idx] });
    Text.fromArray(kept);
  };

  /// Crawl up to 8 priority source files from the repo and enrich baseSignals
  /// with framework detection, TODO counts, test counts, multi-stage Docker,
  /// script presence, fetched file paths, and per-file summaries.
  func enrichSignalsFromSourceFiles(
    owner       : Text,
    repo        : Text,
    baseSignals : Types.RepoSignals,
  ) : async Types.RepoSignals {
    let priorityPaths = Repo.selectFilesToFetch(baseSignals.file_tree);

    var detectedFrameworks : [Text] = [];
    var todoCountSource : Nat = 0;
    var testCount : Nat = 0;
    var hasDockerfileMultistage : Bool = false;
    var hasScripts : Bool = false;
    var fetchedFilePaths : [Text] = [];
    var keyFileSummaries : [(Text, Text)] = [];

    for (filePath in priorityPaths.values()) {
      let raw = await fetchSourceFile(owner, repo, filePath);
      if (raw.size() > 0) {
        let content = truncateContent(raw, 6000);
        fetchedFilePaths := fetchedFilePaths.concat([filePath]);
        keyFileSummaries := keyFileSummaries.concat([(filePath, Repo.buildFileSummary(filePath, content))]);

        // package.json — extract frameworks and scripts
        let fpLower = filePath.toLower();
        if (fpLower == "package.json" or fpLower.endsWith(#text "/package.json")) {
          let frameworks = Repo.parseFrameworks(content);
          detectedFrameworks := detectedFrameworks.concat(frameworks);
          if (not hasScripts) {
            hasScripts := Repo.hasStartScripts(content);
          };
        };

        // Dockerfile — check for multi-stage
        if (fpLower == "dockerfile" or fpLower.endsWith(#text "/dockerfile")) {
          if (not hasDockerfileMultistage) {
            hasDockerfileMultistage := Repo.isMultistageDockerfile(content);
          };
        };

        // Accumulate TODO and test counts from all source files
        todoCountSource += Repo.countTodosInSource(content);
        testCount += Repo.countTests(content);
      };
    };

    {
      baseSignals with
      detected_frameworks       = detectedFrameworks;
      todo_count_source         = todoCountSource;
      test_count                = testCount;
      has_dockerfile_multistage = hasDockerfileMultistage;
      has_scripts               = hasScripts;
      fetched_file_paths        = fetchedFilePaths;
      key_file_summaries        = keyFileSummaries;
    };
  };

  // ── internal: single-repo evaluation ─────────────────────────────────────

  /// Evaluate a single GitHub repo against a parsed assignment.
  /// notes text is appended to readme for signal matching so it contributes to scoring.
  /// overrides: weight multipliers parsed from notes instructions.
  func evaluateSingleRepo(
    repo_url            : Text,
    parsed              : Types.ParsedAssignment,
    notesText           : Text,
    overrides           : Types.WeightOverrides,
    ck                  : Types.CacheKey,
    assignment_text_raw : Text,
  ) : async Types.EvaluationResult {
    // Check evaluation cache first
    switch (evalCache.get(ck)) {
      case (?cached) {
        lastCacheHit.value := true;
        return { cached with cached = true };
      };
      case null {};
    };
    lastCacheHit.value := false;

    let owner = extractOwner(repo_url);
    let (repoOwner, repoName) = switch (Repo.parseGithubUrl(repo_url)) {
      case (?pair) pair;
      case null    (owner, "");
    };

    // Fetch repo data (empty strings / arrays on failure — scoring still works)
    let readmeText = if (repoOwner.size() > 0 and repoName.size() > 0)
      await fetchReadme(repoOwner, repoName) else "";
    let filePaths  = if (repoOwner.size() > 0 and repoName.size() > 0)
      await fetchTree(repoOwner, repoName)  else [];

    // Append notes to readme for signal extraction so notes context affects scoring
    let enrichedReadme = if (notesText.size() > 0) {
      readmeText # "\n\n" # notesText
    } else {
      readmeText
    };

    // Extract signals from enriched readme + file tree (notes already merged into readme)
    let rawSignals = Repo.extractSignals(enrichedReadme, filePaths);

    // Deep source-file crawl — enriches signals with framework detection, TODO counts,
    // test counts, multi-stage Docker, scripts, and per-file summaries.
    let baseSignals = if (repoOwner.size() > 0 and repoName.size() > 0) {
      await enrichSignalsFromSourceFiles(repoOwner, repoName, rawSignals);
    } else {
      rawSignals;
    };

    // Demo link HTTP verification — attempt HEAD request to the extracted demo URL
    // This prevents broken/dead links from scoring as a working demo
    let signals : Types.RepoSignals = if (baseSignals.has_demo_link) {
      let demoVerified : Bool = switch (baseSignals.demo_url) {
        case null false; // has_demo_link was set via keyword but no URL extracted
        case (?dUrl) {
          try {
            let response = await OutCall.httpGetRequest(dUrl, [
              { name = "User-Agent"; value = "RepoEval-Pro/1.0" }
            ], transform);
            // A successful HTTP request returns non-empty body; error paths return ""
            response.size() > 0;
          } catch _ {
            false; // timeout or network error → not verified
          };
        };
      };
      { baseSignals with has_working_demo_link = demoVerified };
    } else {
      baseSignals;
    };

    // Also extract signals from notes text independently and merge (union) with repo signals.
    // This ensures that if notes mention "Redis", "Docker", "deployed to Vercel" etc.
    // but the README doesn't, those signals still count toward scoring.
    let mergedSignals : Types.RepoSignals = if (notesText.size() > 0) {
      let notesSignals = Repo.extractSignals(notesText, []);
      {
        readme_text         = signals.readme_text;          // keep original readme
        file_tree           = signals.file_tree;            // file tree unchanged
        has_dockerfile      = signals.has_dockerfile    or notesSignals.has_dockerfile;
        has_compose         = signals.has_compose       or notesSignals.has_compose;
        has_ci              = signals.has_ci            or notesSignals.has_ci;
        has_terraform       = signals.has_terraform     or notesSignals.has_terraform;
        has_backend         = signals.has_backend       or notesSignals.has_backend;
        has_frontend        = signals.has_frontend      or notesSignals.has_frontend;
        has_auth            = signals.has_auth          or notesSignals.has_auth;
        has_db_config       = signals.has_db_config     or notesSignals.has_db_config;
        has_api_routes      = signals.has_api_routes    or notesSignals.has_api_routes;
        has_demo_link           = signals.has_demo_link           or notesSignals.has_demo_link;
        has_working_demo_link   = signals.has_working_demo_link;  // HTTP verification applies to repo README only
        demo_url                = signals.demo_url;                // keep repo's extracted URL
        has_ai_log              = signals.has_ai_log              or notesSignals.has_ai_log or
          notesText.toLower().contains(#text "prompt_log") or
          notesText.toLower().contains(#text "ai_log") or
          notesText.toLower().contains(#text "chatgpt") or
          notesText.toLower().contains(#text "gpt_log") or
          notesText.toLower().contains(#text "openai.com/share") or
          notesText.toLower().contains(#text "chat.openai") or
          notesText.toLower().contains(#text "claude.ai") or
          notesText.toLower().contains(#text "gemini");
        readme_word_count   = signals.readme_word_count;    // keep original readme word count
        todo_count          = signals.todo_count;           // keep repo value (not from notes)
        has_env_example     = signals.has_env_example   or notesSignals.has_env_example;
        has_seed_data       = signals.has_seed_data     or notesSignals.has_seed_data;
        has_setup_script    = signals.has_setup_script  or notesSignals.has_setup_script;
        error_handler_count = signals.error_handler_count; // keep repo value
        file_count          = signals.file_count;           // keep repo file count
        // Deep source-crawl fields — from crawled signals, not notes
        detected_frameworks       = signals.detected_frameworks;
        todo_count_source         = signals.todo_count_source;
        test_count                = signals.test_count;
        has_dockerfile_multistage = signals.has_dockerfile_multistage;
        has_scripts               = signals.has_scripts;
        fetched_file_paths        = signals.fetched_file_paths;
        key_file_summaries        = signals.key_file_summaries;
      }
    } else {
      signals
    };

    // Scoring — all deterministic, no AI
    let (matched, missing) = Scoring.matchRequirements(parsed, mergedSignals);
    let total = parsed.required_items.size();

    // Count missing core and secondary items for severity-based coverage deduction
    let coreMissing : Nat = missing.filter(func(item) {
      parsed.core_items.any(func(ci) { ci == item })
    }).size();
    let secondaryMissing : Nat = missing.filter(func(item) {
      parsed.secondary_items.any(func(si) { si == item })
    }).size();

    // Determine prompt log presence from notes text and signals
    let notesLower = notesText.toLower();
    let has_prompt_log : Bool = mergedSignals.has_ai_log or
      notesLower.contains(#text "prompt_log") or
      notesLower.contains(#text "ai_log") or
      notesLower.contains(#text "chatgpt") or
      notesLower.contains(#text "gpt_log") or
      notesLower.contains(#text "openai.com/share") or
      notesLower.contains(#text "chat.openai") or
      notesLower.contains(#text "claude.ai") or
      notesLower.contains(#text "gemini");

    let ignore_prompt_log : Bool = overrides.ignore_prompt_log;

    let rawScores : Types.Scores = {
      coverage      = Scoring.coverageScore(matched, total, coreMissing, secondaryMissing);
      stackMatch    = Scoring.stackMatchScore(mergedSignals, parsed);
      completeness  = Scoring.completenessScore(mergedSignals);
      depth         = Scoring.depthScore(mergedSignals, mergedSignals.file_count);
      docs          = Scoring.docsScore(mergedSignals);
      demoReadiness = Scoring.demoScore(mergedSignals);
      aiUsage       = Scoring.aiUsageScore(mergedSignals, has_prompt_log, ignore_prompt_log);
    };

    // Apply weight overrides (per-evaluation, does not modify core engine)
    let scores = Scoring.applyWeightOverrides(rawScores, overrides);

    let fs        = Scoring.finalScore(scores);
    let alignment = Scoring.alignmentFromScore(fs);
    let redFlags  = Scoring.buildRedFlags(scores, parsed, mergedSignals);
    let summary   = Scoring.buildSummary(scores, fs, missing, redFlags, parsed, mergedSignals);
    let projType  = Scoring.projectType(parsed, mergedSignals);
    let verdict   = Scoring.buildRecruiterVerdict(scores, fs, missing);

    let result : Types.EvaluationResult = {
      project_type          = projType;
      alignment;
      scores;
      final_score           = fs;
      missing_items         = missing;
      red_flags             = redFlags;
      summary;
      cached                = false;
      timestamp             = Time.now();
      recruiter_verdict     = ?verdict;
      applied_instructions  = overrides.applied_instructions;
      strengths             = verdict.strengths;
      criticalGaps          = verdict.criticalGaps;
    };

    evalCache.add(ck, result);

    // Persist to history — key = counter + timestamp ensures uniqueness.
    // evalCounter is injected as a mutable record field and persists across upgrades
    // because enhanced orthogonal persistence preserves all actor state.
    evalCounter.value += 1;
    let histId = evalCounter.value.toText() # "-" # result.timestamp.toText();
    let record : Types.EvaluationRecord = {
      id              = histId;
      owner;
      repo_url;
      assignment_text = assignment_text_raw;
      result;
      timestamp       = result.timestamp;
    };
    let sizeBefore = historyStore.size();
    historyStore.add(histId, record);
    let sizeAfter = historyStore.size();
    Debug.print("History store size: " # sizeBefore.toText() # " → " # sizeAfter.toText() # " (id=" # histId # ")");

    result;
  };

  // ── public API ───────────────────────────────────────────────────────────

  /// Evaluate one or more GitHub repos against an assignment description.
  /// Each repo URL is evaluated independently.
  /// Returns an array of EvaluationResult, one per repo URL.
  /// If a repo URL is invalid, an error result with score 0 is included for that repo.
  public func evaluate(
    repo_urls              : [Text],
    assignment_description : Text,
    optional_notes         : ?Text,
  ) : async [Types.EvaluationResult] {
    if (repo_urls.size() == 0) return [];

    let assignmentText = truncateText(assignment_description.trim(#char ' '), MAX_ASSIGNMENT_CHARS);
    if (assignmentText.size() < 10) {
      return [errorResult(
        "Evaluation failed — assignment description is missing or too short.",
        ["Assignment description is missing or too short"],
      )];
    };

    // Resolve raw notes text once
    let rawNotesText : Text = switch optional_notes {
      case null "";
      case (?n) truncateText(n, MAX_NOTES_CHARS);
    };

    // Parse instructions from notes to get weight overrides
    let overrides = Instructions.parseInstructions(rawNotesText);

    // If ignore_notes is set, use empty string for scoring; otherwise expand URLs
    let notesText : Text = if (overrides.ignore_notes) {
      "";
    } else {
      // Expand any embedded URLs in notes (Google Docs, GitHub repos, Notion pages)
      if (rawNotesText.size() > 0) {
        truncateText(await expandUrlsInNotes(rawNotesText), MAX_NOTES_CHARS);
      } else {
        "";
      };
    };

    // Assignment parsing is based only on the assignment; notes are evidence.
    let combinedAssignment = assignmentText;
    let ak = Scoring.assignmentCacheKey(combinedAssignment);

    // Parse assignment once for all repos (deterministic, cached)
    let parsed : Types.ParsedAssignment = switch (assignmentCache.get(ak)) {
      case (?p) p;
      case null {
        let p = await parseAssignment(assignmentText, optional_notes);
        assignmentCache.add(ak, p);
        p;
      };
    };

    // Evaluate each repo independently
    var results : [Types.EvaluationResult] = [];
    var processed : Nat = 0;
    for (repo_url in repo_urls.values()) {
      let trimmed = repo_url.trim(#char ' ');
      if (trimmed.size() == 0 or processed >= MAX_REPOS_PER_EVALUATION) {
        // skip blank entries
      } else {
        processed += 1;
        // Cache key includes notes hash so different notes with same repo+assignment → fresh evaluation
        let notesHash = Scoring.hashText(notesText);
        let ck = Scoring.cacheKey(trimmed, combinedAssignment # "|notes:" # notesHash);
        let result = try {
          await evaluateSingleRepo(trimmed, parsed, notesText, overrides, ck, assignmentText);
        } catch (e) {
          errorResult(
            "Evaluation failed — could not fetch or process this repository.",
            ["Evaluation failed for this repo URL"],
          );
        };
        results := results.concat([result]);
      };
    };

    if (results.size() == 0) {
      return [errorResult(
        "Evaluation failed — no valid repository URLs were provided.",
        ["No valid repository URLs were provided"],
      )];
    };

    results;
  };

  /// Fetch text content of a Google Docs document for use as notes.
  /// The URL must start with https://docs.google.com/
  /// Returns #ok(text) on success or #err(message) on failure.
  public func fetchGoogleDocText(url : Text) : async Types.ExtractTextResult {
    if (not url.startsWith(#text "https://docs.google.com/")) {
      return #err("URL must be a Google Docs link (https://docs.google.com/...)");
    };
    // Build export URL: append /export?format=txt if not already present
    let exportUrl = if (url.contains(#text "/export")) {
      url
    } else {
      // Strip any trailing params and append export
      let parts = url.split(#char '?').toArray();
      let base = if (parts.size() > 0) parts[0] else url;
      // Ensure base ends with /export
      (if (base.endsWith(#text "/")) base else base # "/") # "export?format=txt";
    };

    let raw = try {
      await OutCall.httpGetRequest(exportUrl, [
        { name = "User-Agent"; value = "RepoEval-Pro/1.0" }
      ], transform);
    } catch _ { "" };

    if (raw.size() == 0) {
      #err("Could not fetch Google Docs content. Ensure the document is publicly accessible.")
    } else {
      let trimmed = raw.trim(#char ' ');
      let text = if (trimmed.size() > 10_000) {
        let chars = trimmed.toArray();
        let kept = Array.tabulate(10_000, func(idx : Nat) : Char { chars[idx] });
        Text.fromArray(kept) # "[...truncated]"
      } else {
        trimmed
      };
      #ok({ text; is_clean = true });
    };
  };

  /// Clear all cached evaluation and assignment-parse results.
  public func clearCache() : async () {
    evalCache.clear();
    assignmentCache.clear();
    lastCacheHit.value := false;
  };

  /// Return lightweight cache statistics.
  public func getCacheStats() : async { entries : Nat; lastHit : Bool } {
    {
      entries = evalCache.size() + assignmentCache.size();
      lastHit = lastCacheHit.value;
    };
  };

  /// Return all evaluation history records, sorted newest-first.
  public query func getHistory() : async [Types.EvaluationRecord] {
    let all = historyStore.toArray();
    let records = all.map(func((_, r)) { r });
    records.sort(func(a, b) { Int.compare(b.timestamp, a.timestamp) });
  };

  /// Look up a single evaluation result by its history record id.
  public query func getEvaluationById(id : Text) : async ?Types.EvaluationResult {
    switch (historyStore.get(id)) {
      case (?record) ?record.result;
      case null      null;
    };
  };

  /// Return all evaluation history records, sorted newest-first.
  /// Alias of getHistory — stable, callable query for export use.
  public query func getExportHistory() : async [Types.EvaluationRecord] {
    let all = historyStore.toArray();
    let records = all.map(func((_, r)) { r });
    records.sort(func(a, b) { Int.compare(b.timestamp, a.timestamp) });
  };

  /// Return all evaluation history records for a given repo URL, sorted newest-first.
  public query func getHistoryByRepo(repo_url : Text) : async [Types.EvaluationRecord] {
    let all = historyStore.toArray();
    let filtered = all.filterMap(func((_, r) : (Text, Types.EvaluationRecord)) : ?Types.EvaluationRecord {
      if (r.repo_url == repo_url) ?r else null
    });
    filtered.sort(func(a, b) { Int.compare(b.timestamp, a.timestamp) });
  };

  /// Return aggregate statistics grouped by project_type (role), sorted by count descending.
  /// Numeric fields are scaled by 10 for 1-decimal precision (e.g., 75 = 7.5).
  public query func getRoleStats() : async [Types.RoleStats] {
    let all = historyStore.toArray();

    let acc = Map.empty<Text, {
      var count            : Nat;
      var sum_score        : Nat;
      var min_score        : Nat;
      var max_score        : Nat;
      var sum_coverage     : Nat;
      var sum_stack_match  : Nat;
      var sum_completeness : Nat;
      var sum_depth        : Nat;
      var sum_docs         : Nat;
      var sum_demo         : Nat;
      var sum_ai_usage     : Nat;
    }>();

    for ((_, record) in all.vals()) {
      let role = record.result.project_type;
      let s    = record.result.scores;
      let fs   = record.result.final_score;

      switch (acc.get(role)) {
        case (?entry) {
          entry.count            += 1;
          entry.sum_score        += fs;
          if (fs < entry.min_score) entry.min_score := fs;
          if (fs > entry.max_score) entry.max_score := fs;
          entry.sum_coverage     += s.coverage;
          entry.sum_stack_match  += s.stackMatch;
          entry.sum_completeness += s.completeness;
          entry.sum_depth        += s.depth;
          entry.sum_docs         += s.docs;
          entry.sum_demo         += s.demoReadiness;
          entry.sum_ai_usage     += s.aiUsage;
        };
        case null {
          acc.add(role, {
            var count            = 1;
            var sum_score        = fs;
            var min_score        = fs;
            var max_score        = fs;
            var sum_coverage     = s.coverage;
            var sum_stack_match  = s.stackMatch;
            var sum_completeness = s.completeness;
            var sum_depth        = s.depth;
            var sum_docs         = s.docs;
            var sum_demo         = s.demoReadiness;
            var sum_ai_usage     = s.aiUsage;
          });
        };
      };
    };

    let statsArr = acc.toArray().map(
      func((role, e)) : Types.RoleStats {
        let n = e.count;
        {
          role;
          count            = n;
          avg_score        = (e.sum_score        * 10) / n;
          min_score        = e.min_score;
          max_score        = e.max_score;
          avg_coverage     = (e.sum_coverage     * 10) / n;
          avg_stack_match  = (e.sum_stack_match  * 10) / n;
          avg_completeness = (e.sum_completeness * 10) / n;
          avg_depth        = (e.sum_depth        * 10) / n;
          avg_docs         = (e.sum_docs         * 10) / n;
          avg_demo         = (e.sum_demo         * 10) / n;
          avg_ai_usage     = (e.sum_ai_usage     * 10) / n;
        };
      }
    );

    statsArr.sort(func(a, b) { Nat.compare(b.count, a.count) });
  };

  /// Delete an evaluation history record by its id.
  /// Returns true if the record existed and was removed, false if not found.
  public func deleteEvaluation(id : Text) : async Bool {
    switch (historyStore.get(id)) {
      case null  false;
      case (?_) {
        historyStore.remove(id);
        Debug.print("Deleted history record: " # id # " — remaining: " # historyStore.size().toText());
        true;
      };
    };
  };

  /// Return the current application version string.
  /// Used by the frontend to display a version badge.
  public query func getVersion() : async Text {
    "v14";
  };
};
