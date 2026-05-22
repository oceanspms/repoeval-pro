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

  // ── internal: AI assignment parsing ──────────────────────────────────────

  /// Call OpenAI-compatible API to parse an assignment into { role, required_items }.
  /// Temperature MUST be 0 for determinism.
  /// Notes text is appended to assignment text before parsing so requirements
  /// in notes are included in the structured checklist.
  func parseAssignment(assignmentText : Text, notes : ?Text) : async Types.ParsedAssignment {
    let notesSection = switch notes {
      case null "";
      case (?n) "\n\nAdditional context and notes:\n" # n;
    };
    let combinedText = assignmentText # notesSection;
    let prompt = "You are an assignment classifier. Given the following hiring assignment, respond with ONLY a JSON object (no markdown, no explanation) in this exact format:\n{\"role\":\"<DevOps|Fullstack|Backend|Frontend>\",\"required_items\":[\"item1\",\"item2\",...]}\n\nAssignment:\n" # combinedText;

    let body = "{\"model\":\"gpt-4o-mini\",\"temperature\":0,\"messages\":[{\"role\":\"user\",\"content\":" # jsonString(prompt) # "}]}";

    let raw = try {
      await OutCall.httpPostRequest(
        "https://api.openai.com/v1/chat/completions",
        [
          { name = "Content-Type";  value = "application/json" },
          { name = "Authorization"; value = "Bearer sk-placeholder" },
          { name = "User-Agent";    value = "RepoEval-Pro/1.0" }
        ],
        body,
        transform
      );
    } catch _ { "" };

    parseParsedAssignment(raw, assignmentText);
  };

  /// Minimal JSON string escaper.
  func jsonString(s : Text) : Text {
    let escaped = s.replace(#char '\\', "\\\\")
                   .replace(#text "\"",  "\\\"")
                   .replace(#char '\n', "\\n")
                   .replace(#char '\r', "\\r")
                   .replace(#char '\t', "\\t");
    "\"" # escaped # "\"";
  };

  /// Parse AI response JSON into ParsedAssignment.
  /// Falls back to a heuristic role + empty items on parse failure.
  func parseParsedAssignment(json : Text, assignmentText : Text) : Types.ParsedAssignment {
    let role : Text = switch (extractJsonStringField(json, "role")) {
      case (?r) {
        let rl = r.toLower();
        if      (rl.contains(#text "devops"))    "DevOps"
        else if (rl.contains(#text "fullstack") or rl.contains(#text "full")) "Fullstack"
        else if (rl.contains(#text "backend"))   "Backend"
        else if (rl.contains(#text "frontend"))  "Frontend"
        else r;
      };
      case null {
        let al = assignmentText.toLower();
        if      (al.contains(#text "devops") or al.contains(#text "terraform") or al.contains(#text "kubernetes")) "DevOps"
        else if (al.contains(#text "fullstack") or al.contains(#text "full-stack")) "Fullstack"
        else if (al.contains(#text "backend")  or al.contains(#text "api")) "Backend"
        else if (al.contains(#text "frontend") or al.contains(#text "react")) "Frontend"
        else "General";
      };
    };

    let items : [Text] = switch (extractJsonArray(json, "required_items")) {
      case (?arr) arr;
      case null   [];
    };

    { role; required_items = items };
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
    let signals = Repo.extractSignals(enrichedReadme, filePaths);

    // Also extract signals from notes text independently and merge (union) with repo signals.
    // This ensures that if notes mention "Redis", "Docker", "deployed to Vercel" etc.
    // but the README doesn't, those signals still count toward scoring.
    let mergedSignals : Types.RepoSignals = if (notesText.size() > 0) {
      let notesSignals = Repo.extractSignals(notesText, []);
      {
        readme_text       = signals.readme_text;          // keep original readme
        file_tree         = signals.file_tree;            // file tree unchanged
        has_dockerfile    = signals.has_dockerfile    or notesSignals.has_dockerfile;
        has_compose       = signals.has_compose       or notesSignals.has_compose;
        has_ci            = signals.has_ci            or notesSignals.has_ci;
        has_terraform     = signals.has_terraform     or notesSignals.has_terraform;
        has_backend       = signals.has_backend       or notesSignals.has_backend;
        has_frontend      = signals.has_frontend      or notesSignals.has_frontend;
        has_auth          = signals.has_auth          or notesSignals.has_auth;
        has_db_config     = signals.has_db_config     or notesSignals.has_db_config;
        has_api_routes    = signals.has_api_routes    or notesSignals.has_api_routes;
        has_demo_link     = signals.has_demo_link     or notesSignals.has_demo_link;
        has_ai_log        = signals.has_ai_log        or notesSignals.has_ai_log;
        readme_word_count = signals.readme_word_count;    // keep original readme word count
      }
    } else {
      signals
    };

    // Scoring — all deterministic, no AI
    let (matched, missing) = Scoring.matchRequirements(parsed, mergedSignals);
    let total = parsed.required_items.size();

    let rawScores : Types.Scores = {
      coverage     = Scoring.coverageScore(matched, total);
      stackMatch   = Scoring.stackMatchScore(parsed, mergedSignals);
      completeness = Scoring.completenessScore(mergedSignals);
      depth        = Scoring.depthScore(mergedSignals);
      docs         = Scoring.docsScore(mergedSignals);
      demo         = Scoring.demoScore(mergedSignals);
      aiUsage      = Scoring.aiUsageScore(mergedSignals);
    };

    // Apply weight overrides (per-evaluation, does not modify core engine)
    let scores = Scoring.applyWeightOverrides(rawScores, overrides);

    let fs        = Scoring.finalScore(scores);
    let alignment = Scoring.alignmentFromScore(fs);
    let redFlags  = Scoring.buildRedFlags(scores, parsed, mergedSignals);
    let summary   = Scoring.buildSummary(scores, fs, missing, redFlags, parsed, mergedSignals);
    let projType  = Scoring.projectType(parsed, mergedSignals);
    let verdict   = Scoring.buildRecruiterVerdict(fs, scores, mergedSignals);

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

    // Resolve raw notes text once
    let rawNotesText : Text = switch optional_notes {
      case null "";
      case (?n) n;
    };

    // Parse instructions from notes to get weight overrides
    let overrides = Instructions.parseInstructions(rawNotesText);

    // If ignore_notes is set, use empty string for scoring; otherwise expand URLs
    let notesText : Text = if (overrides.ignore_notes) {
      "";
    } else {
      // Expand any embedded URLs in notes (Google Docs, GitHub repos, Notion pages)
      if (rawNotesText.size() > 0) {
        await expandUrlsInNotes(rawNotesText);
      } else {
        "";
      };
    };

    // Cache key for assignment parsing includes notes so different notes = different parse
    let combinedAssignment = assignment_description # (switch optional_notes {
      case null "";
      case (?n) "\n" # n;
    });
    let ak = Scoring.assignmentCacheKey(combinedAssignment);

    // Parse assignment once for all repos (AI call, cached)
    let parsed : Types.ParsedAssignment = switch (assignmentCache.get(ak)) {
      case (?p) p;
      case null {
        let p = await parseAssignment(assignment_description, optional_notes);
        assignmentCache.add(ak, p);
        p;
      };
    };

    // Evaluate each repo independently
    var results : [Types.EvaluationResult] = [];
    for (repo_url in repo_urls.values()) {
      let trimmed = repo_url.trim(#char ' ');
      if (trimmed.size() == 0) {
        // skip blank entries
      } else {
        // Cache key includes notes hash so different notes with same repo+assignment → fresh evaluation
        let notesHash = Scoring.hashText(notesText);
        let ck = Scoring.cacheKey(trimmed, combinedAssignment # "|notes:" # notesHash);
        let result = try {
          await evaluateSingleRepo(trimmed, parsed, notesText, overrides, ck, assignment_description);
        } catch (e) {
          // On error for this repo, return a zero-score error result
          let errorResult : Types.EvaluationResult = {
            project_type          = "Error";
            alignment             = #Low;
            scores                = { coverage = 0; stackMatch = 0; completeness = 0; depth = 0; docs = 0; demo = 0; aiUsage = 0 };
            final_score           = 0;
            missing_items         = [];
            red_flags             = ["Evaluation failed for this repo URL"];
            summary               = "Evaluation failed — could not fetch or process this repository.";
            cached                = false;
            timestamp             = Time.now();
            recruiter_verdict     = null;
            applied_instructions  = [];
          };
          errorResult;
        };
        results := results.concat([result]);
      };
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
          entry.sum_demo         += s.demo;
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
            var sum_demo         = s.demo;
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
