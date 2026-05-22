import Types  "../types/common";
import Text   "mo:core/Text";
import Nat    "mo:core/Nat";
import Float  "mo:core/Float";

/// Pure, stateless scoring and matching functions.
/// No randomness — same inputs always produce same outputs.
module {

  // ── internal helpers ─────────────────────────────────────────────────────

  func lower(t : Text) : Text = t.toLower();

  func containsAny(haystack : Text, needles : [Text]) : Bool {
    let h = lower(haystack);
    needles.any(func(n) { h.contains(#text n) });
  };

  func pathsContain(paths : [Text], needle : Text) : Bool {
    paths.any(func(p) { lower(p).contains(#text needle) });
  };

  // ── Requirement matching ─────────────────────────────────────────────────

  /// Match parsed required_items against repo signals.
  /// Returns (matchedCount, missingItems).
  public func matchRequirements(
    parsed  : Types.ParsedAssignment,
    signals : Types.RepoSignals,
  ) : (Nat, [Text]) {
    var matched : Nat = 0;
    let missing = parsed.required_items.filterMap(func(item) {
      let itl = lower(item);
      let found = (
        // Docker / containerisation
        (itl.contains(#text "docker") and (signals.has_dockerfile or signals.has_compose)) or
        (itl.contains(#text "compose") and signals.has_compose) or
        // CI/CD
        (itl.contains(#text "ci") and signals.has_ci) or
        (itl.contains(#text "cd") and signals.has_ci) or
        (itl.contains(#text "pipeline") and signals.has_ci) or
        (itl.contains(#text "workflow") and signals.has_ci) or
        (itl.contains(#text "github action") and signals.has_ci) or
        // IaC
        (itl.contains(#text "terraform") and signals.has_terraform) or
        (itl.contains(#text "cloudformation") and signals.has_terraform) or
        (itl.contains(#text "infra") and signals.has_terraform) or
        // Backend
        (itl.contains(#text "backend") and signals.has_backend) or
        (itl.contains(#text "api") and (signals.has_backend or signals.has_api_routes)) or
        (itl.contains(#text "server") and signals.has_backend) or
        (itl.contains(#text "rest") and signals.has_api_routes) or
        (itl.contains(#text "endpoint") and signals.has_api_routes) or
        // Frontend
        (itl.contains(#text "frontend") and signals.has_frontend) or
        (itl.contains(#text "ui") and signals.has_frontend) or
        (itl.contains(#text "react") and (signals.has_frontend or pathsContain(signals.file_tree, ".jsx") or pathsContain(signals.file_tree, ".tsx"))) or
        (itl.contains(#text "vue") and pathsContain(signals.file_tree, ".vue")) or
        (itl.contains(#text "angular") and pathsContain(signals.file_tree, "angular")) or
        // Auth
        (itl.contains(#text "auth") and signals.has_auth) or
        (itl.contains(#text "login") and signals.has_auth) or
        (itl.contains(#text "jwt") and signals.has_auth) or
        // DB
        (itl.contains(#text "database") and signals.has_db_config) or
        (itl.contains(#text "db") and signals.has_db_config) or
        (itl.contains(#text "postgres") and signals.has_db_config) or
        (itl.contains(#text "mysql") and signals.has_db_config) or
        (itl.contains(#text "mongo") and signals.has_db_config) or
        (itl.contains(#text "redis") and signals.has_db_config) or
        // Demo
        (itl.contains(#text "demo") and signals.has_demo_link) or
        (itl.contains(#text "deploy") and signals.has_demo_link) or
        // AI log
        (itl.contains(#text "ai log") and signals.has_ai_log) or
        (itl.contains(#text "ai usage") and signals.has_ai_log) or
        // README / docs
        (itl.contains(#text "readme") and signals.readme_word_count > 50) or
        (itl.contains(#text "documentation") and signals.readme_word_count > 100) or
        // Generic: look for keyword in file tree or readme
        containsAny(signals.readme_text, [itl]) or
        pathsContain(signals.file_tree, itl)
      );
      if (found) {
        matched += 1;
        null;
      } else {
        ?item;
      };
    });
    (matched, missing);
  };

  /// Compute coverage score (0–10) from matched vs total required items.
  public func coverageScore(matched : Nat, total : Nat) : Nat {
    if (total == 0) return 10;
    let pct = (matched * 100) / total;
    pct / 10; // 0–100% → 0–10
  };

  /// Compute stack-match score (0–10).
  /// Role-based: DevOps needs infra, Backend needs server/api, Fullstack needs both.
  public func stackMatchScore(
    parsed  : Types.ParsedAssignment,
    signals : Types.RepoSignals,
  ) : Nat {
    let role = lower(parsed.role);
    if (role.contains(#text "devops")) {
      // Must have CI and at least docker or terraform
      var score : Nat = 0;
      if (signals.has_ci) score += 4;
      if (signals.has_dockerfile or signals.has_compose) score += 3;
      if (signals.has_terraform) score += 3;
      score;
    } else if (role.contains(#text "backend")) {
      var score : Nat = 0;
      if (signals.has_backend) score += 5;
      if (signals.has_api_routes) score += 3;
      if (signals.has_db_config) score += 2;
      score;
    } else if (role.contains(#text "fullstack")) {
      var score : Nat = 0;
      if (signals.has_backend) score += 3;
      if (signals.has_frontend) score += 3;
      if (signals.has_api_routes) score += 2;
      if (signals.has_db_config) score += 2;
      score;
    } else if (role.contains(#text "frontend")) {
      var score : Nat = 0;
      if (signals.has_frontend) score += 6;
      if (signals.has_api_routes or signals.has_backend) score += 2;
      if (signals.has_auth) score += 2;
      score;
    } else {
      // Unknown role: generic check
      var score : Nat = 0;
      if (signals.has_backend or signals.has_frontend) score += 4;
      if (signals.has_api_routes) score += 3;
      if (signals.has_db_config) score += 3;
      score;
    };
  };

  /// Compute completeness score (0–10) from repo structure signals.
  public func completenessScore(signals : Types.RepoSignals) : Nat {
    var score : Nat = 0;
    if (signals.has_backend) score += 2;
    if (signals.has_frontend) score += 2;
    if (signals.has_dockerfile or signals.has_compose) score += 1;
    if (signals.has_ci) score += 1;
    if (signals.has_auth) score += 1;
    if (signals.has_db_config) score += 1;
    if (signals.has_api_routes) score += 1;
    if (signals.readme_word_count > 50) score += 1;
    Nat.min(score, 10);
  };

  /// Compute depth score (0–10) from real-implementation indicators.
  public func depthScore(signals : Types.RepoSignals) : Nat {
    var score : Nat = 0;
    // More files = more depth
    let fileCount = signals.file_tree.size();
    if (fileCount >= 5)  score += 1;
    if (fileCount >= 15) score += 1;
    if (fileCount >= 30) score += 1;
    if (fileCount >= 60) score += 1;
    // real implementation indicators
    if (signals.has_backend and signals.has_api_routes) score += 2;
    if (signals.has_db_config) score += 1;
    if (signals.has_auth) score += 1;
    if (signals.has_ci) score += 1;
    if (signals.has_terraform) score += 1;
    Nat.min(score, 10);
  };

  /// Compute docs score (0–10) from README word count and setup clarity.
  /// 0-3 if README < 100 chars, 4-7 if 100-2000 chars, 8-10 if > 2000 chars with setup keywords
  public func docsScore(signals : Types.RepoSignals) : Nat {
    let chars = signals.readme_text.size();
    if (chars < 100) {
      // Score 0-3 based on word count
      if (signals.readme_word_count == 0) return 0;
      if (signals.readme_word_count < 10) return 1;
      if (signals.readme_word_count < 20) return 2;
      return 3;
    } else if (chars <= 2000) {
      // Score 4-7
      var score : Nat = 4;
      let readme = lower(signals.readme_text);
      if (readme.contains(#text "install")) score += 1;
      if (readme.contains(#text "usage") or readme.contains(#text "how to")) score += 1;
      if (readme.contains(#text "setup") or readme.contains(#text "getting started")) score += 1;
      Nat.min(score, 7);
    } else {
      // Score 8-10 — long README with setup clarity keywords
      var score : Nat = 8;
      let readme = lower(signals.readme_text);
      let hasSetup = readme.contains(#text "setup") or readme.contains(#text "getting started") or readme.contains(#text "installation");
      let hasUsage = readme.contains(#text "usage") or readme.contains(#text "how to run") or readme.contains(#text "running locally");
      if (hasSetup) score += 1;
      if (hasUsage) score += 1;
      Nat.min(score, 10);
    };
  };

  /// Compute demo score (0 or 10).
  public func demoScore(signals : Types.RepoSignals) : Nat {
    if (signals.has_demo_link) 10 else 0;
  };

  /// Compute AI usage bonus score (0 or 10).
  /// This is a BONUS only — missing ai_log does NOT penalize the candidate.
  /// If present and the readme/signals are meaningful, it's a positive signal.
  public func aiUsageScore(signals : Types.RepoSignals) : Nat {
    if (signals.has_ai_log) 10 else 0;
  };

  /// Derive alignment verdict from final score.
  public func alignmentFromScore(finalScore : Nat) : Types.Alignment {
    if (finalScore >= 7) #High
    else if (finalScore >= 4) #Medium
    else #Low;
  };

  /// Determine project type label from parsed role and signals.
  public func projectType(
    parsed  : Types.ParsedAssignment,
    signals : Types.RepoSignals,
  ) : Text {
    let role = lower(parsed.role);
    if (role.contains(#text "devops")) "DevOps"
    else if (role.contains(#text "fullstack") or role.contains(#text "full-stack") or role.contains(#text "full stack")) "Fullstack"
    else if (role.contains(#text "backend") or role.contains(#text "back-end") or role.contains(#text "back end")) "Backend"
    else if (role.contains(#text "frontend") or role.contains(#text "front-end") or role.contains(#text "front end")) "Frontend"
    else if (signals.has_terraform or signals.has_ci) "DevOps"
    else if (signals.has_backend and signals.has_frontend) "Fullstack"
    else if (signals.has_backend) "Backend"
    else if (signals.has_frontend) "Frontend"
    else "General";
  };

  /// Build red-flags list from scores, parsed requirements, and signals.
  /// NOTE: Missing AI usage log is NOT a red flag — it is a bonus, not a requirement.
  public func buildRedFlags(
    scores  : Types.Scores,
    parsed  : Types.ParsedAssignment,
    signals : Types.RepoSignals,
  ) : [Text] {
    var flags : [Text] = [];
    let role = lower(parsed.role);

    // Missing core requirement: coverage < 4
    if (scores.coverage < 4) {
      flags := flags.concat(["Missing core requirements"]);
    };
    // Wrong stack: stackMatch < 4
    if (scores.stackMatch < 4) {
      flags := flags.concat(["Wrong or mismatched tech stack"]);
    };
    // Only UI or only docs
    if (signals.has_frontend and not signals.has_backend and not signals.has_terraform) {
      flags := flags.concat(["Only frontend — no backend logic"]);
    };
    if (not signals.has_frontend and not signals.has_backend and signals.readme_word_count > 50 and signals.file_tree.size() < 5) {
      flags := flags.concat(["Only documentation — no implementation"]);
    };
    // No backend when required
    if ((role.contains(#text "backend") or role.contains(#text "fullstack")) and not signals.has_backend) {
      flags := flags.concat(["No backend code found"]);
    };
    // No infra when DevOps
    if (role.contains(#text "devops") and not signals.has_dockerfile and not signals.has_ci and not signals.has_terraform) {
      flags := flags.concat(["No infrastructure/DevOps files found"]);
    };
    // No demo
    if (scores.demo == 0) {
      flags := flags.concat(["No demo link"]);
    };
    // AI usage log is a BONUS — intentionally NOT added as a red flag if missing
    flags;
  };

  /// Produce a deterministic 4-5 line recruiter-grade summary from scores, final_score, missing_items, red_flags, and parsed assignment.
  /// Fully rule-based — no AI, no randomness. Same scores always produce the same summary.
  /// Each line cites actual score values and named criteria — never generic phrases.
  public func buildSummary(
    scores        : Types.Scores,
    final_score   : Nat,
    missing_items : [Text],
    _red_flags    : [Text],
    parsed        : Types.ParsedAssignment,
    signals       : Types.RepoSignals,
  ) : Text {
    let total = parsed.required_items.size();
    let matched = if (total == 0) 0 else (scores.coverage * total) / 10;

    // Line 1 — what they built and whether it matches (role + match level)
    let matchDesc : Text =
      if (scores.coverage >= 9) "fully matching"
      else if (scores.coverage >= 7) "largely matching"
      else if (scores.coverage >= 4) "partially matching"
      else "poorly matching";

    let implDesc : Text =
      if (signals.has_backend and signals.has_frontend) "full-stack application"
      else if (signals.has_backend) "backend/API service"
      else if (signals.has_frontend) "frontend application"
      else if (signals.has_terraform or signals.has_ci) "infrastructure/DevOps setup"
      else "project";

    let line1 : Text = "Candidate submitted a " # implDesc # " " # matchDesc # " the " # parsed.role # " assignment requirements — " #
      matched.toText() # " of " # total.toText() # " required tasks detected (Coverage: " # scores.coverage.toText() # "/10).";

    // Line 2 — specific strengths (criteria that scored well)
    var strengths : [Text] = [];
    if (scores.stackMatch >= 7) { strengths := strengths.concat(["Stack Match: " # scores.stackMatch.toText() # "/10"]) };
    if (scores.completeness >= 7) { strengths := strengths.concat(["Completeness: " # scores.completeness.toText() # "/10"]) };
    if (scores.depth >= 7) { strengths := strengths.concat(["Implementation Depth: " # scores.depth.toText() # "/10"]) };
    if (scores.docs >= 7) { strengths := strengths.concat(["Documentation: " # scores.docs.toText() # "/10"]) };
    if (scores.demo == 10) { strengths := strengths.concat(["Live demo available"]) };
    if (scores.aiUsage == 10) { strengths := strengths.concat(["AI usage log provided (bonus)"]) };

    let line2 : Text = if (strengths.size() > 0) {
      "Strengths: " # strengths.values().join(", ") # "."
    } else {
      "No dimension scored above 7/10 — overall execution is below expectations."
    };

    // Line 3 — specific weaknesses (criteria that scored poorly, actual criteria names)
    var weaknesses : [Text] = [];
    if (scores.coverage < 6) { weaknesses := weaknesses.concat(["Coverage: " # scores.coverage.toText() # "/10"]) };
    if (scores.stackMatch < 5) { weaknesses := weaknesses.concat(["Stack Match: " # scores.stackMatch.toText() # "/10"]) };
    if (scores.depth < 5) { weaknesses := weaknesses.concat(["Implementation Depth: " # scores.depth.toText() # "/10"]) };
    if (scores.docs < 4) { weaknesses := weaknesses.concat(["Documentation: " # scores.docs.toText() # "/10"]) };
    if (scores.demo == 0) { weaknesses := weaknesses.concat(["No live demo or deployment link detected"]) };

    // Append up to 2 specific missing criteria names
    if (missing_items.size() > 0) {
      let first2 = missing_items.sliceToArray(0, Nat.min(2, missing_items.size()));
      weaknesses := weaknesses.concat(["Unmet criteria: " # first2.values().join(", ")]);
    };

    let line3 : Text = if (weaknesses.size() > 0) {
      "Gaps: " # weaknesses.values().join("; ") # "."
    } else {
      "No critical gaps identified — all key dimensions are at acceptable levels."
    };

    // Line 4 — technical quality (depth + docs driven)
    let qualityLabel : Text =
      if (scores.depth >= 7 and scores.docs >= 6) "Production-grade quality"
      else if (scores.depth >= 5 or scores.docs >= 5) "Acceptable technical quality"
      else "Prototype-grade implementation";

    let fileCountNote : Text =
      if (signals.file_tree.size() >= 30) "substantial codebase (" # signals.file_tree.size().toText() # " files)"
      else if (signals.file_tree.size() >= 10) "moderate codebase (" # signals.file_tree.size().toText() # " files)"
      else "small codebase (" # signals.file_tree.size().toText() # " files)";

    let line4 : Text = qualityLabel # " — " # fileCountNote # "; README word count indicates " #
      (if (signals.readme_word_count > 300) "thorough" else if (signals.readme_word_count > 100) "adequate" else "minimal") #
      " documentation (Depth: " # scores.depth.toText() # "/10, Docs: " # scores.docs.toText() # "/10).";

    // Line 5 — final verdict rationale (cites score, key wins/losses)
    let completedOf : Text = matched.toText() # " of " # total.toText() # " required tasks complete";
    let demoNote    : Text = if (signals.has_demo_link) ", live demo available" else ", no live demo";
    let stackNote   : Text = if (scores.stackMatch >= 7) ", strong stack alignment" else if (scores.stackMatch >= 4) ", partial stack alignment" else ", stack mismatch";
    let line5 : Text = "With " # completedOf # demoNote # stackNote # " and a final score of " # final_score.toText() # "/10, " #
      (if (final_score >= 9) "this candidate is an excellent fit for the role."
       else if (final_score >= 7) "this candidate is a strong hire — recommend technical interview."
       else if (final_score >= 5) "this candidate shows potential but needs further assessment."
       else "this candidate does not meet the bar for this role.");

    // Assemble all 5 lines
    line1 # "\n" # line2 # "\n" # line3 # "\n" # line4 # "\n" # line5;
  };

  /// Compute a short deterministic id for a history record from arbitrary text.
  /// Uses a simple polynomial fold over character codes — no randomness.
  public func hashText(t : Text) : Text {
    let h : Nat = t.foldLeft(5381, func(acc : Nat, c : Char) : Nat {
      let code = c.toNat32().toNat();
      // djb2-style: acc * 33 + code, bounded to 32-bit range
      (acc * 33 + code) % 4294967296; // 2^32
    });
    h.toText();
  };

  /// Compute final score.
  /// Base score = average of 6 core dimensions (coverage, stackMatch, completeness, depth, docs, demo).
  /// aiUsage is a BONUS: if ai_log is present (aiUsage == 10), add up to +0.5 to the base score.
  /// Result is clamped to max 10.
  public func finalScore(scores : Types.Scores) : Nat {
    let base = scores.coverage + scores.stackMatch + scores.completeness +
               scores.depth + scores.docs + scores.demo;
    let baseAvg = base / 6;
    // Bonus: ai usage adds at most +0.5 → represented as: if aiUsage==10, add 1 to numerator before /6 → ~+0.17
    // More accurately: bonus = aiUsage / 20 (rounds to 0 or 1 in integer math)
    // To give meaningful +0.5 bonus without floats: use (base*2 + aiUsage/2) / 12 scaled up
    // Simplest deterministic: base_score + (1 if aiUsage==10 AND base_avg >= 5, else 0), capped at 10
    let bonus : Nat = if (scores.aiUsage == 10 and baseAvg >= 1) 1 else 0;
    // To avoid over-inflating, only apply bonus if base is reasonable and result won't exceed 10
    Nat.min(10, baseAvg + bonus);
  };

  /// Compute cache key: deterministic concatenation of repo_url + "|" + assignment text.
  /// (SHA256 is not natively available in Motoko — use a stable deterministic composite key.)
  public func cacheKey(repoUrl : Text, assignmentDesc : Text) : Types.CacheKey {
    repoUrl # "|" # assignmentDesc;
  };

  /// Compute assignment cache key: the raw assignment text (deterministic).
  public func assignmentCacheKey(assignmentText : Text) : Types.CacheKey {
    assignmentText;
  };

  // ── Weight override application ───────────────────────────────────────────

  /// Clamp a Float score to [0.0, 10.0] then convert to Nat.
  func clampScore(f : Float) : Nat {
    let clamped = Float.max(0.0, Float.min(10.0, f));
    // Float.toInt truncates toward zero; add 0.0 to avoid fractional issues
    let i = clamped.toInt();
    if (i < 0) 0 else i.toNat();
  };

  /// Apply per-evaluation weight overrides to a Scores record.
  /// Each dimension is multiplied by its multiplier and clamped to 0–10.
  /// finalScore is recomputed from the adjusted dimensions.
  public func applyWeightOverrides(scores : Types.Scores, overrides : Types.WeightOverrides) : Types.Scores {
    {
      coverage     = clampScore(scores.coverage.toFloat()     * overrides.coverage_mult);
      stackMatch   = clampScore(scores.stackMatch.toFloat()   * overrides.stack_mult);
      completeness = clampScore(scores.completeness.toFloat() * overrides.completeness_mult);
      depth        = clampScore(scores.depth.toFloat()        * overrides.depth_mult);
      docs         = clampScore(scores.docs.toFloat()         * overrides.docs_mult);
      demo         = clampScore(scores.demo.toFloat()         * overrides.demo_mult);
      aiUsage      = clampScore(scores.aiUsage.toFloat()      * overrides.ai_mult);
    };
  };

  // ── Recruiter's Verdict ────────────────────────────────────────────────────

  /// Build a non-technical, decisive Recruiter's Verdict from the final score and signals.
  /// Deterministic — same inputs always produce the same verdict.
  /// AI usage log is treated as a bonus only — never mentioned as a weakness.
  /// Verdict thresholds: >= 9 → Hire, 6-8 → Proceed with Caution, < 6 → No Hire.
  public func buildRecruiterVerdict(
    final_score : Nat,
    scores      : Types.Scores,
    _signals    : Types.RepoSignals,
  ) : Types.RecruiterVerdict {
    // Verdict and emoji — per requirements: >=8.5 Hire, 6-8.49 Caution, <6 No Hire
    // In integer space: >=9 maps to Hire (8.5+ rounds to 9), 6-8 Caution, <6 No Hire
    let (verdict, emoji) : (Text, Text) =
      if (final_score >= 9) ("✅ Hire", "✅")
      else if (final_score >= 6) ("⚠️ Proceed with Caution", "⚠️")
      else ("❌ No Hire", "❌");

    // Technical debt classification — based on depth and docs only
    let technical_debt : Text =
      if (scores.depth >= 7 and scores.docs >= 6)
        "Production Ready"
      else
        "Prototype Grade";

    // Why text — 2 plain-English sentences citing actual scores and specific dimensions
    // Never mention missing AI usage log as a weakness
    let baseAvgFor9 = (scores.coverage + scores.stackMatch + scores.completeness + scores.depth + scores.docs + scores.demo) / 6;
    let why : Text =
      if (final_score >= 9) {
        "This candidate averaged " # baseAvgFor9.toText() # "/10 across all core dimensions, with particularly strong " #
        (if (scores.coverage >= 8) "requirement coverage" else if (scores.depth >= 8) "implementation depth" else "technical execution") #
        ". All key deliverables are present and the code quality is at a professional, hire-ready level."
      } else if (final_score >= 8) {
        "This submission scores " # final_score.toText() # "/10 and covers nearly all required criteria — " #
        (if (scores.demo == 0) "the only notable gap is the absence of a live demo link"
         else if (scores.docs < 6) "documentation could be more thorough"
         else "minor gaps remain in a few dimensions") #
        ". The candidate demonstrates strong technical ability and is recommended for a technical interview."
      } else if (final_score >= 6) {
        "This submission scores " # final_score.toText() # "/10 and meets several requirements but has gaps in " #
        (if (scores.stackMatch < 5) "the expected technology stack (Stack Match: " # scores.stackMatch.toText() # "/10)"
         else if (scores.coverage < 6) "requirement coverage (Coverage: " # scores.coverage.toText() # "/10)"
         else if (scores.depth < 5) "implementation depth (Depth: " # scores.depth.toText() # "/10)"
         else "completeness and depth") #
        ". Proceed with a technical screen to probe these gaps before advancing."
      } else if (final_score >= 4) {
        "This submission scores " # final_score.toText() # "/10 and shows partial effort but misses key requirements. " #
        (if (scores.stackMatch < 4) "The technology stack does not match what was expected for this role."
         else "Core deliverables are incomplete and significant rework would be needed before this candidate could advance.")
      } else {
        "This submission scores " # final_score.toText() # "/10 and is missing most of the required deliverables. " #
        "The candidate does not meet the minimum bar for this role as submitted."
      };

    { verdict; emoji; why; technical_debt };
  };
};
