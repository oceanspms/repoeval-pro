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
        // Tests / validation
        (itl.contains(#text "test") and (signals.test_count > 0 or pathsContain(signals.file_tree, "test"))) or
        (itl.contains(#text "spec") and (signals.test_count > 0 or pathsContain(signals.file_tree, "spec"))) or
        (itl.contains(#text "validation") and signals.error_handler_count > 0) or
        // README / docs
        (itl.contains(#text "readme") and signals.readme_word_count > 50) or
        (itl.contains(#text "documentation") and signals.readme_word_count > 100) or
        (itl.contains(#text "docs") and signals.readme_word_count > 100) or
        (itl.contains(#text "setup") and (signals.readme_word_count > 100 or signals.has_setup_script)) or
        (itl.contains(#text "instruction") and signals.readme_word_count > 100) or
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

  /// Compute coverage score (0-100) from matched vs total required items.
  public func coverageScore(matched : Nat, total : Nat, coreMissing : Nat, secondaryMissing : Nat) : Nat {
    // Safety: if the parser returned no requirements (should not happen after parse fix),
    // return 0. Returning 100 for 0/0 is false inflation.
    if (total == 0) return 0;
    let ratioScore = Nat.min((matched * 100) / total, 100);
    var severityScore : Int = 100;
    severityScore -= (coreMissing * 20 : Int);
    severityScore -= (secondaryMissing * 5 : Int);
    let boundedSeverity = if (severityScore < 0) 0 else severityScore.toNat();
    Nat.min(ratioScore, boundedSeverity);
  };

  /// Role-based: DevOps needs infra, Backend needs server/api, Fullstack needs both.
  /// Compute stack-match score (0–100).
  /// Role-aware: Frontend assignments are NOT penalised for lacking a database or server.
  /// DevOps assignments are penalised for lacking infra tools.
  public func stackMatchScore(
    signals        : Types.RepoSignals,
    parsed         : Types.ParsedAssignment,
  ) : Nat {
    let role = lower(parsed.role);
    if (role.contains(#text "devops")) {
      var score : Nat = 0;
      if (signals.has_ci) score += 40;
      if (signals.has_dockerfile or signals.has_compose) score += 30;
      if (signals.has_terraform) score += 30;
      return Nat.min(score, 100);
    };
    if (role.contains(#text "backend")) {
      var score : Nat = 0;
      if (signals.has_backend) score += 50;
      if (signals.has_api_routes) score += 30;
      if (signals.has_db_config) score += 20;
      return Nat.min(score, 100);
    };
    if (role.contains(#text "fullstack") or role.contains(#text "full-stack") or role.contains(#text "full stack")) {
      var score : Nat = 0;
      if (signals.has_backend) score += 30;
      if (signals.has_frontend) score += 30;
      if (signals.has_api_routes) score += 20;
      if (signals.has_db_config) score += 20;
      return Nat.min(score, 100);
    };
    if (role.contains(#text "frontend") or role.contains(#text "front-end") or role.contains(#text "front end")) {
      var score : Nat = 0;
      if (signals.has_frontend) score += 70;
      if (signals.detected_frameworks.size() > 0) score += 15;
      if (signals.has_scripts) score += 15;
      return Nat.min(score, 100);
    };
    var base : Nat = 0;
    if (signals.has_backend or signals.has_frontend) base += 50;
    if (signals.has_api_routes) base += 20;
    if (signals.has_db_config) base += 15;
    if (signals.has_ci or signals.has_dockerfile or signals.has_compose) base += 15;
    Nat.min(base, 100);
  };

  /// Compute completeness score (0–100) from repo structure signals.
  /// Frontend-only repos are not penalised for lacking backend/API route files.
  public func completenessScore(signals : Types.RepoSignals) : Nat {
    var score : Int = 100;
    let isFrontendOnly : Bool = signals.has_frontend and not signals.has_backend;
    // Use source file TODO count if available (more accurate), else fallback to readme/path count
    let effectiveTodos = if (signals.todo_count_source > 0) signals.todo_count_source
                         else signals.todo_count;
    let todoDeduction : Int = if (effectiveTodos >= 20) 40
      else if (effectiveTodos >= 10) 25
      else if (effectiveTodos >= 5)  15
      else if (effectiveTodos >= 1)  5
      else 0;
    score -= todoDeduction;
    // No implementation at all
    if (not signals.has_backend and not signals.has_frontend and not signals.has_terraform) {
      score -= 30;
    };
    // For backend/fullstack: penalise missing API routes
    if (not isFrontendOnly and signals.has_backend and not signals.has_api_routes) {
      score -= 10;
    };
    if (signals.file_count < 5) {
      score -= 20;
    } else if (signals.file_count < 10) {
      score -= 10;
    };
    if (score < 0) return 0;
    score.toNat();
  };

  /// Compute depth score (0–100) from real-implementation indicators.
  /// Role-aware: for frontend-only repos, penalise lack of UI components/structure
  /// rather than missing auth/db (which are backend concerns).
  public func depthScore(signals : Types.RepoSignals, file_count : Nat) : Nat {
    var score : Int = 100;
    if (file_count < 5) {
      score -= 40;
    } else if (file_count < 15) {
      score -= 20;
    } else if (file_count < 30) {
      score -= 10;
    };
    // Test coverage signal from deep crawl
    if (signals.test_count == 0 and
        signals.detected_frameworks.any(func(f) {
          let fl = f.toLower();
          fl == "jest" or fl == "vitest" or fl == "mocha" or fl == "jasmine" or fl == "pytest"
        })) {
      // Has a test framework but no tests found — significant deduction
      score -= 20;
    } else if (signals.test_count > 5) {
      score += 5;  // meaningful test suite present
    } else if (signals.test_count > 0) {
      score += 2;  // some tests present
    };
    // For frontend-only repos, do not penalise for missing auth/db (backend concerns)
    let isFrontendOnly : Bool = signals.has_frontend and not signals.has_backend;
    if (isFrontendOnly) {
      let hasComponents = signals.file_tree.any(func(p) {
        let pl = p.toLower();
        pl.contains(#text "components/") or pl.contains(#text "pages/") or
        pl.contains(#text "hooks/") or pl.contains(#text "context/") or pl.contains(#text "store/")
      });
      if (not hasComponents) score -= 10;
      if (signals.has_ci) score += 5;
    } else {
      if (not signals.has_auth) score -= 10;
      if (not signals.has_db_config) score -= 5;
      if (not signals.has_ci) score -= 5;
    };
    if (signals.error_handler_count >= 3) {
      score += 10;
    } else if (signals.error_handler_count >= 1) {
      score += 5;
    };
    if (score < 0) return 0;
    Nat.min(score.toNat(), 100);
  };

  /// Compute docs score (0–100) from README word count and setup clarity.
  /// Frontend-only projects are not penalised for lacking API documentation.
  public func docsScore(signals : Types.RepoSignals) : Nat {
    var score : Int = 100;
    let readme = lower(signals.readme_text);
    let isFrontendOnly : Bool = signals.has_frontend and not signals.has_backend;
    let hasArchitecture = readme.contains(#text "architecture") or readme.contains(#text "system design") or readme.contains(#text "overview") or readme.contains(#text "about");
    // API docs only matter for backend/fullstack assignments
    let hasApiDocs = isFrontendOnly or readme.contains(#text "api") or readme.contains(#text "endpoint") or readme.contains(#text "route");
    let hasSetupGuide = readme.contains(#text "install") or readme.contains(#text "setup") or
                        readme.contains(#text "getting started") or readme.contains(#text "running") or
                        readme.contains(#text "npm") or readme.contains(#text "yarn") or
                        readme.contains(#text "usage");
    if (not hasArchitecture) score -= 15;
    if (not hasApiDocs) score -= 10;       // always false for frontend-only (skipped above)
    if (not hasSetupGuide) score -= 10;
    if (signals.readme_word_count < 100) score -= 20
    else if (signals.readme_word_count < 200) score -= 10;
    if (score < 0) return 0;
    score.toNat();
  };

  /// Compute demo readiness score (0–100).
  /// Tier 1 (90–100): verified live demo (HTTP check passed).
  /// Tier 2 (60):     demo link in README but HTTP verification failed/skipped.
  ///                  Link exists and MAY work — do NOT drop to 0.
  /// Tier 3 (70):     Dockerfile / docker-compose (can be spun up).
  /// Tier 4 (55):     start/dev scripts in package.json.
  /// Tier 5 (40):     proper README with setup instructions.
  /// Tier 6 (25):     some docs but minimal setup.
  /// Tier 7 (10):     README exists but no setup info.
  /// ONLY 0  if repo is completely empty / unreachable.
  public func demoScore(signals : Types.RepoSignals) : Nat {
    // Tier 1 & 2: demo link present
    if (signals.has_demo_link) {
      if (signals.has_working_demo_link) {
        // Verified live demo
        return if (signals.has_dockerfile_multistage) 100 else 90;
      } else {
        // Link exists but HTTP verification failed or was not performed.
        // The link may still be a valid deployment — do NOT punish heavily.
        // Base score 60; boost slightly for additional setup signals.
        var s : Int = 60;
        if (signals.has_dockerfile or signals.has_compose) s += 5;
        if (signals.has_scripts or signals.has_setup_script) s += 5;
        return Nat.min(s.toNat(), 75);
      };
    };

    // No demo link — score purely on setup / deployment readiness
    var setupScore : Int = 0;

    if (signals.has_dockerfile_multistage) {
      setupScore := 70;
    } else if (signals.has_compose) {
      setupScore := 65;
    } else if (signals.has_dockerfile) {
      setupScore := 62;
    };

    if (signals.has_scripts) setupScore += 10;
    if (signals.has_setup_script) setupScore += 8;
    if (signals.has_env_example) setupScore += 5;

    // README quality boosts
    let readmeLower = lower(signals.readme_text);
    let hasSetup = readmeLower.contains(#text "install") or
                   readmeLower.contains(#text "getting started") or
                   readmeLower.contains(#text "how to run") or
                   readmeLower.contains(#text "setup");
    let hasRunCmd = readmeLower.contains(#text "npm start") or
                    readmeLower.contains(#text "yarn start") or
                    readmeLower.contains(#text "npm run dev") or
                    readmeLower.contains(#text "docker") or
                    readmeLower.contains(#text "make ") or
                    readmeLower.contains(#text "./ ");

    if (setupScore > 0) {
      // Already has Docker/scripts — small README boost
      if (hasSetup) setupScore += 5;
      return Nat.min(setupScore.toNat(), 80);
    };

    // No Docker, no scripts
    if (hasSetup and hasRunCmd) return 40;
    if (hasSetup) return 30;
    if (signals.readme_word_count > 100) return 25;
    if (signals.readme_word_count > 20) return 10;

    // Truly empty repo or completely unreachable
    0;
  };

  /// Compute AI evidence score on the 0-100 scale.
  /// Missing ai_log is treated as a neutral signal, not as a red flag.
  /// If present and the readme/signals are meaningful, it is a positive signal.
  public func aiUsageScore(
    signals           : Types.RepoSignals,
    has_prompt_log    : Bool,
    ignore_prompt_log : Bool,
  ) : Nat {
    if (ignore_prompt_log) return 50;
    // Neutral baseline: 60 when no AI/prompt log is present.
    // This reflects "no signal" rather than a perfect score, preventing
    // repos without any AI log from inflating the composite via the 10% AI weight.
    var score : Int = 60;
    if (has_prompt_log) {
      // Valid prompt log present — boost toward full score
      score := 100;
    } else {
      // No prompt log — check for boilerplate patterns and deduct further
      let boilerplateRisk = signals.has_frontend and not signals.has_backend and not signals.has_db_config;
      if (boilerplateRisk) score -= 20;
    };
    if (score < 0) return 0;
    Nat.min(score.toNat(), 100);
  };

  /// Derive alignment verdict from final score.
  public func alignmentFromScore(finalScore_ : Nat) : Types.Alignment {
    if (finalScore_ >= 80) #High
    else if (finalScore_ >= 60) #Medium
    else #Low;
  };

  /// Determine project type label from parsed role and signals.
  /// Determine project type label from parsed role and signals.
  /// The parsed role takes priority; signals are used only as a fallback.
  public func projectType(
    parsed  : Types.ParsedAssignment,
    signals : Types.RepoSignals,
  ) : Text {
    let role = lower(parsed.role);
    // Explicit role label from assignment parser — highest priority
    if (role.contains(#text "devops"))                        "DevOps"
    else if (role.contains(#text "fullstack") or role.contains(#text "full-stack") or role.contains(#text "full stack")) "Fullstack"
    else if (role.contains(#text "backend") or role.contains(#text "back-end") or role.contains(#text "back end"))  "Backend"
    else if (role.contains(#text "frontend") or role.contains(#text "front-end") or role.contains(#text "front end")) "Frontend"
    else if (role.contains(#text "mobile"))                   "Mobile"
    else if (role.contains(#text "qa"))                       "QA"
    else if (role.contains(#text "ml") or role.contains(#text "machine learning")) "ML"
    // Signal-based fallback (only when role is "General" or unrecognised)
    else if (signals.has_terraform or signals.has_ci)         "DevOps"
    else if (signals.has_backend and signals.has_frontend)    "Fullstack"
    else if (signals.has_backend)                             "Backend"
    else if (signals.has_frontend)                            "Frontend"
    else "General";
  };

  /// Build red-flags list from scores, parsed requirements, and signals.
  /// NOTE: Missing AI usage log is NOT a red flag; it is evidence, not a hard requirement.
  public func buildRedFlags(
    scores  : Types.Scores,
    parsed  : Types.ParsedAssignment,
    signals : Types.RepoSignals,
  ) : [Text] {
    var flags : [Text] = [];
    let role = lower(parsed.role);
    if (scores.coverage < 40) {
      flags := flags.concat(["Missing core requirements"]);
    };
    if (scores.stackMatch < 40) {
      flags := flags.concat(["Wrong or mismatched tech stack"]);
    };
    // Only fire "no backend" warning when the assignment EXPECTS backend code.
    // Skip entirely for Frontend-only and Mobile assignments — they should have no backend.
    let isFrontendOrMobileRole : Bool =
      role.contains(#text "frontend") or role.contains(#text "front-end") or
      role.contains(#text "front end") or role.contains(#text "mobile");
    if (not isFrontendOrMobileRole and
        signals.has_frontend and not signals.has_backend and not signals.has_terraform) {
      flags := flags.concat(["Only frontend — no backend logic"]);
    };
    if (not signals.has_frontend and not signals.has_backend and signals.readme_word_count > 50 and signals.file_count < 5) {
      flags := flags.concat(["Only documentation — no implementation"]);
    };
    if ((role.contains(#text "backend") or role.contains(#text "fullstack")) and not signals.has_backend) {
      flags := flags.concat(["No backend code found"]);
    };
    if (role.contains(#text "devops") and not signals.has_dockerfile and not signals.has_ci and not signals.has_terraform) {
      flags := flags.concat(["No infrastructure/DevOps files found"]);
    };
    if (scores.demoReadiness == 0) {
      flags := flags.concat(["Not demo-ready"]);
    };
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
    let matched : Nat = if (total == 0) 0 else {
      let missCount = missing_items.size();
      let diff : Int = (total : Int) - (missCount : Int);
      if (diff <= 0) 0 else diff.toNat()
    };

    var strongestLabel = "Coverage";
    var strongestScore = scores.coverage;
    func considerStrong(dimensionLabel : Text, score : Nat) {
      if (score > strongestScore) {
        strongestLabel := dimensionLabel;
        strongestScore := score;
      };
    };
    considerStrong("Stack Match", scores.stackMatch);
    considerStrong("Completeness", scores.completeness);
    considerStrong("Implementation Depth", scores.depth);
    considerStrong("Documentation", scores.docs);
    considerStrong("Demo Readiness", scores.demoReadiness);
    considerStrong("AI Usage Evidence", scores.aiUsage);

    var weakestLabel = "Coverage";
    var weakestScore = scores.coverage;
    func considerWeak(dimensionLabel : Text, score : Nat) {
      if (score < weakestScore) {
        weakestLabel := dimensionLabel;
        weakestScore := score;
      };
    };
    considerWeak("Stack Match", scores.stackMatch);
    considerWeak("Completeness", scores.completeness);
    considerWeak("Implementation Depth", scores.depth);
    considerWeak("Documentation", scores.docs);
    considerWeak("Demo Readiness", scores.demoReadiness);
    considerWeak("AI Usage Evidence", scores.aiUsage);

    // ── Paragraph 1: OVERVIEW ──────────────────────────────────────────────
    let implDesc : Text =
      if (signals.has_backend and signals.has_frontend) "full-stack application"
      else if (signals.has_backend) "backend/API service"
      else if (signals.has_frontend) "frontend application"
      else if (signals.has_terraform or signals.has_ci) "infrastructure/DevOps setup"
      else "project";

    let frameworkNote : Text = if (signals.detected_frameworks.size() > 0) {
      let fwList = signals.detected_frameworks.sliceToArray(0, Nat.min(3, signals.detected_frameworks.size()));
      " Stack detected from package.json: " # fwList.values().join(", ") # ".";
    } else {
      "";
    };

    let coverageDesc : Text =
      if (total == 0) "no assignment requirements could be extracted, so rubric confidence is low"
      else if (scores.coverage >= 90) "nearly all " # matched.toText() # " of " # total.toText() # " requirements are met"
      else if (scores.coverage >= 70) matched.toText() # " of " # total.toText() # " requirements are met with some gaps"
      else if (scores.coverage >= 50) "roughly " # matched.toText() # " of " # total.toText() # " requirements are present — significant gaps remain"
      else "only " # matched.toText() # " of " # total.toText() # " requirements were found — core deliverables are missing";

    let overallQuality : Text =
      if (final_score >= 90) "This is a near-flawless submission."
      else if (final_score >= 80) "This is a strong, production-oriented submission."
      else if (final_score >= 70) "This submission is solid but has a few notable gaps."
      else if (final_score >= 60) "The submission is functional but falls short of production standards in several areas."
      else if (final_score >= 40) "This is a partial submission with significant missing elements."
      else "This submission does not meet the minimum bar for the role.";

    let p1 = "OVERVIEW: This " # parsed.role # " submission presents a " # implDesc # " where " # coverageDesc # " (Coverage: " # scores.coverage.toText() # "/100)." # frameworkNote # " " # overallQuality # " Stack Match is " # scores.stackMatch.toText() # "/100, final score is " # final_score.toText() # "/100, and the report should be read against the extracted assignment rubric rather than generic repo quality alone.";

    // ── Paragraph 2: STRENGTHS ─────────────────────────────────────────────
    var strongPoints : [Text] = [];
    if (scores.coverage >= 70) {
      strongPoints := strongPoints.concat(["Feature coverage is strong (" # scores.coverage.toText() # "/100) — " # matched.toText() # " of " # total.toText() # " required criteria are present"]);
    };
    if (scores.stackMatch >= 70) {
      let fwNote = if (signals.detected_frameworks.size() > 0)
        " (" # signals.detected_frameworks.sliceToArray(0, Nat.min(2, signals.detected_frameworks.size())).values().join(", ") # " confirmed)"
        else "";
      strongPoints := strongPoints.concat(["Stack alignment at " # scores.stackMatch.toText() # "/100" # fwNote]);
    };
    if (scores.depth >= 70) {
      let depthNote = if (signals.test_count > 0)
        "Implementation depth (" # scores.depth.toText() # "/100) is solid — " # signals.test_count.toText() # " test cases found"
        else "Implementation depth (" # scores.depth.toText() # "/100) shows a mature engineering approach";
      strongPoints := strongPoints.concat([depthNote]);
    };
    if (scores.docs >= 70) {
      strongPoints := strongPoints.concat(["README documentation is thorough (" # scores.docs.toText() # "/100) — setup, architecture, and usage are addressed"]);
    };
    if (scores.demoReadiness >= 80) {
      let demoNote = if (signals.has_working_demo_link) "Live demo verified and accessible"
        else if (signals.has_dockerfile_multistage) "Multi-stage Dockerfile — production-grade deployment"
        else if (signals.has_scripts) "package.json start/dev scripts present — easy local setup"
        else "Demo readiness at " # scores.demoReadiness.toText() # "/100";
      strongPoints := strongPoints.concat([demoNote]);
    };
    if (signals.has_ci) {
      strongPoints := strongPoints.concat(["CI pipeline present — professional development workflow"]);
    };
    let p2 = if (strongPoints.size() > 0) {
      "STRENGTHS: Strongest measured area is " # strongestLabel # " (" # strongestScore.toText() # "/100). " # strongPoints.values().join("; ") # "."
    } else {
      "STRENGTHS: Strongest measured area is " # strongestLabel # " (" # strongestScore.toText() # "/100), but no dimension cleared 70/100. The submission shows limited evidence of role-ready execution."
    };

    // ── Paragraph 3: CRITICAL GAPS ─────────────────────────────────────────
    var gapPoints : [Text] = [];
    if (total == 0) {
      gapPoints := gapPoints.concat(["No assignment requirements could be extracted, so the rubric must be reviewed before making a hiring decision"]);
    } else if (scores.coverage < 70) {
      let missSlice = missing_items.sliceToArray(0, Nat.min(3, missing_items.size()));
      let missNote = if (missSlice.size() > 0) " Missing: " # missSlice.values().join(", ") else "";
      gapPoints := gapPoints.concat(["Coverage at " # scores.coverage.toText() # "/100 — key requirements are absent." # missNote]);
    };
    if (scores.stackMatch < 60) {
      gapPoints := gapPoints.concat(["Stack match at " # scores.stackMatch.toText() # "/100 — required technologies missing or substituted"]);
    };
    if (scores.demoReadiness < 50) {
      let demoGap = if (signals.has_demo_link and not signals.has_working_demo_link)
        "Demo link present but unreachable — deployment is broken or not live"
        else "No live demo or deployment setup — evaluator cannot run the app without manual effort";
      gapPoints := gapPoints.concat([demoGap]);
    };
    if (scores.depth < 60) {
      let todoNote = if (signals.todo_count_source > 0)
        " (" # signals.todo_count_source.toText() # " TODO/FIXME stubs in source files)"
        else if (signals.todo_count > 0) " (TODO markers detected)" else "";
      gapPoints := gapPoints.concat(["Implementation depth at " # scores.depth.toText() # "/100" # todoNote # " — critical code paths show placeholder logic or missing error handling"]);
    };
    if (scores.docs < 50) {
      gapPoints := gapPoints.concat(["README at " # scores.docs.toText() # "/100 — missing setup guide, architecture overview, or API docs"]);
    };
    if (scores.completeness < 60) {
      gapPoints := gapPoints.concat(["Completeness at " # scores.completeness.toText() # "/100 — repo shows signs of incomplete implementation"]);
    };
    let p3 = if (gapPoints.size() > 0) {
      "CRITICAL GAPS: Weakest measured area is " # weakestLabel # " (" # weakestScore.toText() # "/100). " # gapPoints.values().join("; ") # "."
    } else {
      "CRITICAL GAPS: Weakest measured area is " # weakestLabel # " (" # weakestScore.toText() # "/100), but no critical knockout-level gap was identified. All key dimensions are at acceptable levels."
    };

    // ── Paragraph 4: RECOMMENDATION ────────────────────────────────────────
    // Automatic leniency: coverage >= 85 AND depth >= 80 → minor gaps not held against candidate
    let isStrongCandidate = scores.coverage >= 85 and scores.depth >= 80;
    let fileCountNote =
      if (signals.file_count >= 30) "substantial codebase (" # signals.file_count.toText() # " files)"
      else if (signals.file_count >= 10) "moderate codebase (" # signals.file_count.toText() # " files)"
      else "small codebase (" # signals.file_count.toText() # " files)";
    let maturityNote =
      if (scores.depth >= 80 and scores.docs >= 70) "production-grade maturity"
      else if (scores.depth >= 60) "intermediate maturity with room for growth"
      else "junior-to-mid level maturity";
    let fetchedNote = if (signals.fetched_file_paths.size() > 0) {
      let paths = signals.fetched_file_paths.sliceToArray(0, Nat.min(3, signals.fetched_file_paths.size()));
      " Source files reviewed: " # paths.values().join(", ") # ".";
    } else { "" };
    let evidenceNote : Text =
      " Evidence reviewed: " #
      (if (signals.fetched_file_paths.size() > 0) "README, repo tree, and selected source files" else "README and repo tree") #
      (if (signals.has_demo_link and signals.has_working_demo_link) "; live demo verified"
       else if (signals.has_demo_link) "; demo link found but not verified"
       else "; no demo link found") #
      (if (signals.has_ai_log) "; prompt/AI log evidence found" else "; no prompt/AI log evidence found") # ".";
    let interviewFocus : Text =
      if (missing_items.size() > 0) {
        let focus = missing_items.sliceToArray(0, Nat.min(2, missing_items.size()));
        " Interview focus: ask the candidate to walk through " # focus.values().join(" and ") # "."
      } else if (scores.depth < 70) {
        " Interview focus: probe implementation depth, error handling, and whether the main flows are real rather than placeholder code."
      } else if (scores.demoReadiness < 60) {
        " Interview focus: verify that the app can be run or deployed reliably."
      } else {
        " Interview focus: validate ownership of the implementation and tradeoffs behind the strongest parts of the submission."
      };
    let recommendation : Text =
      if (final_score >= 80 or isStrongCandidate) {
        "Recommend advancing to technical interview. " #
        (if (isStrongCandidate and final_score >= 75)
          "Strong candidate — coverage and depth both exceed the bar; minor gaps noted but not disqualifying. "
          else "") #
        "Final score: " # final_score.toText() # "/100."
      } else if (final_score >= 60) {
        "Proceed with caution — targeted technical screen recommended to probe identified gaps. Final score: " # final_score.toText() # "/100."
      } else {
        "Do not advance. Submission does not meet minimum requirements for " # parsed.role # ". Final score: " # final_score.toText() # "/100."
      };
    let p4 = "RECOMMENDATION: " # recommendation # " Code shows " # maturityNote # " — " # fileCountNote # "." # fetchedNote # evidenceNote # " " # interviewFocus;

    p1 # "\n\n" # p2 # "\n\n" # p3 # "\n\n" # p4;
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
  /// Final weighted score on the same 0-100 scale as the dimensions.
  /// Weights: coverage/stack 35%, completeness/depth 35%, demo/docs 20%, AI evidence 10%.
  public func finalScore(scores : Types.Scores) : Nat {
    weightedFinalScore(scores, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
  };

  /// Compute final score with note-driven weighting.
  /// Dimension values remain raw evidence scores; only the composite weighting changes.
  public func finalScoreWithOverrides(scores : Types.Scores, overrides : Types.WeightOverrides) : Nat {
    weightedFinalScore(
      scores,
      overrides.coverage_mult,
      overrides.stack_mult,
      overrides.completeness_mult,
      overrides.depth_mult,
      overrides.docs_mult,
      overrides.demoReadiness_mult,
      overrides.ai_mult,
    );
  };

  func weightedFinalScore(
    scores : Types.Scores,
    coverageMult : Float,
    stackMult : Float,
    completenessMult : Float,
    depthMult : Float,
    docsMult : Float,
    demoReadinessMult : Float,
    aiMult : Float,
  ) : Nat {
    let coverageWeight = 0.175 * Float.max(0.0, coverageMult);
    let stackWeight = 0.175 * Float.max(0.0, stackMult);
    let completenessWeight = 0.175 * Float.max(0.0, completenessMult);
    let depthWeight = 0.175 * Float.max(0.0, depthMult);
    let demoWeight = 0.10 * Float.max(0.0, demoReadinessMult);
    let docsWeight = 0.10 * Float.max(0.0, docsMult);
    let aiWeight = 0.10 * Float.max(0.0, aiMult);
    let totalWeight = coverageWeight + stackWeight + completenessWeight + depthWeight + demoWeight + docsWeight + aiWeight;
    if (totalWeight <= 0.0) return 0;
    let weighted = (
      scores.coverage.toFloat() * coverageWeight +
      scores.stackMatch.toFloat() * stackWeight +
      scores.completeness.toFloat() * completenessWeight +
      scores.depth.toFloat() * depthWeight +
      scores.demoReadiness.toFloat() * demoWeight +
      scores.docs.toFloat() * docsWeight +
      scores.aiUsage.toFloat() * aiWeight
    ) / totalWeight;
    let rounded = weighted + 0.5;
    let i = rounded.toInt();
    let result = if (i < 0) 0 else i.toNat();
    Nat.min(result, 100);
  };

  public func cacheKey(repoUrl : Text, assignmentDesc : Text) : Types.CacheKey {
    repoUrl # "|" # assignmentDesc;
  };

  public func assignmentCacheKey(assignmentText : Text) : Types.CacheKey {
    assignmentText;
  };

  // ── Weight override application ───────────────────────────────────────────

  /// Clamp a Float score to [0.0, 100.0] then convert to Nat.
  func clampScore100(f : Float) : Nat {
    let clamped = Float.max(0.0, Float.min(100.0, f));
    let i = clamped.toInt();
    if (i < 0) 0 else i.toNat();
  };

  /// Strict verdict logic with dual knockouts.
  public func verdictFromScore(score : Nat, scores : Types.Scores) : { #pass; #caution; #fail } {
    // Knockout 2 (absolute): any single dimension < 30 = instant FAIL
    if (scores.coverage < 30 or scores.stackMatch < 30 or scores.completeness < 30 or
        scores.depth < 30 or scores.docs < 30 or scores.demoReadiness < 30 or scores.aiUsage < 30) {
      return #fail;
    };
    // Base verdict from composite score
    var verdict : { #pass; #caution; #fail } =
      if (score >= 80) #pass
      else if (score >= 60) #caution
      else #fail;
    // Knockout 1: Coverage or DemoReadiness < 50 caps at caution
    if (scores.coverage < 50 or scores.demoReadiness < 50) {
      if (verdict == #pass) verdict := #caution;
    };
    verdict;
  };

  /// Apply per-evaluation weight overrides to a Scores record.
  /// Each dimension is multiplied by its multiplier and clamped to 0-100.
  /// finalScore is recomputed from the adjusted dimensions.
  public func applyWeightOverrides(scores : Types.Scores, overrides : Types.WeightOverrides) : Types.Scores {
    {
      coverage      = clampScore100(scores.coverage.toFloat()      * overrides.coverage_mult);
      stackMatch    = clampScore100(scores.stackMatch.toFloat()     * overrides.stack_mult);
      completeness  = clampScore100(scores.completeness.toFloat()   * overrides.completeness_mult);
      depth         = clampScore100(scores.depth.toFloat()          * overrides.depth_mult);
      docs          = clampScore100(scores.docs.toFloat()           * overrides.docs_mult);
      demoReadiness = clampScore100(scores.demoReadiness.toFloat()  * overrides.demoReadiness_mult);
      aiUsage       = clampScore100(scores.aiUsage.toFloat()        * overrides.ai_mult);
    };
  };

  // ── Recruiter's Verdict ────────────────────────────────────────────────────

  /// Build a non-technical, decisive Recruiter's Verdict from the final score and signals.
  /// Deterministic — same inputs always produce the same verdict.
  /// AI usage log is treated as evidence only and is never mentioned as a weakness.
  /// Verdict thresholds: >= 9 → Hire, 6-8 → Proceed with Caution, < 6 → No Hire.
  public func buildRecruiterVerdict(
    scores       : Types.Scores,
    finalScore_  : Nat,
    missingItems : [Text],
  ) : Types.RecruiterVerdict {
    let verdict = verdictFromScore(finalScore_, scores);
    let emoji : Text =
      switch verdict {
        case (#pass)    "✅";
        case (#caution) "⚠️";
        case (#fail)    "❌";
      };
    let technical_debt : Text =
      if (scores.depth >= 70 and scores.docs >= 70 and finalScore_ >= 80) "Production Ready"
      else if (finalScore_ >= 60) "Needs Work"
      else "Prototype Grade";
    let why : Text =
      switch verdict {
        case (#pass) {
          "This candidate scored " # finalScore_.toText() # "/100 overall, with Coverage at " #
          scores.coverage.toText() # ", Stack Match at " # scores.stackMatch.toText() #
          ", and Demo Readiness at " # scores.demoReadiness.toText() # ". " #
          "The submission clears the score and knockout bars; use the interview to validate implementation ownership and the strongest technical choices."
        };
        case (#caution) {
          let gapDim : Text =
            if (scores.coverage < 50) "Coverage (" # scores.coverage.toText() # "/100)"
            else if (scores.demoReadiness < 50) "Demo Readiness (" # scores.demoReadiness.toText() # "/100)"
            else if (scores.stackMatch < 60) "Stack Match (" # scores.stackMatch.toText() # "/100)"
            else if (scores.depth < 60) "Implementation Depth (" # scores.depth.toText() # "/100)"
            else "Completeness (" # scores.completeness.toText() # "/100)";
          "This candidate scored " # finalScore_.toText() # "/100 overall but has a notable gap in " # gapDim # ". " #
          "A technical screen is recommended before advancing, focused on whether this gap is a presentation issue or a real implementation weakness."
        };
        case (#fail) {
          let worstDim : Text =
            if (scores.coverage < 30) "Coverage (" # scores.coverage.toText() # "/100)"
            else if (scores.demoReadiness < 30) "Demo Readiness (" # scores.demoReadiness.toText() # "/100)"
            else if (scores.stackMatch < 30) "Stack Match (" # scores.stackMatch.toText() # "/100)"
            else if (scores.completeness < 30) "Completeness (" # scores.completeness.toText() # "/100)"
            else if (scores.depth < 30) "Depth (" # scores.depth.toText() # "/100)"
            else "overall composite score (" # finalScore_.toText() # "/100)";
          "This submission does not meet the minimum bar — the critical failure is in " # worstDim # ". " #
          "Core requirements, stack alignment, depth, documentation, or demo readiness are below the minimum bar; the candidate should not advance without substantial clarification."
        };
      };
    var strengthsList : [Text] = [];
    if (scores.coverage >= 70)      strengthsList := strengthsList.concat(["Coverage: " # scores.coverage.toText() # "/100"]);
    if (scores.stackMatch >= 70)    strengthsList := strengthsList.concat(["Stack Match: " # scores.stackMatch.toText() # "/100"]);
    if (scores.completeness >= 70)  strengthsList := strengthsList.concat(["Completeness: " # scores.completeness.toText() # "/100"]);
    if (scores.depth >= 70)         strengthsList := strengthsList.concat(["Implementation Depth: " # scores.depth.toText() # "/100"]);
    if (scores.docs >= 70)          strengthsList := strengthsList.concat(["Documentation: " # scores.docs.toText() # "/100"]);
    if (scores.demoReadiness >= 70) strengthsList := strengthsList.concat(["Demo Readiness: " # scores.demoReadiness.toText() # "/100"]);
    if (scores.aiUsage >= 70)       strengthsList := strengthsList.concat(["AI Usage: " # scores.aiUsage.toText() # "/100"]);
    var gapsList : [Text] = [];
    if (scores.coverage < 50)      gapsList := gapsList.concat(["Coverage below 50 (" # scores.coverage.toText() # ")"]);
    if (scores.stackMatch < 50)    gapsList := gapsList.concat(["Stack Match below 50 (" # scores.stackMatch.toText() # ")"]);
    if (scores.completeness < 50)  gapsList := gapsList.concat(["Completeness below 50 (" # scores.completeness.toText() # ")"]);
    if (scores.depth < 50)         gapsList := gapsList.concat(["Depth below 50 (" # scores.depth.toText() # ")"]);
    if (scores.docs < 50)          gapsList := gapsList.concat(["Docs below 50 (" # scores.docs.toText() # ")"]);
    if (scores.demoReadiness < 50) gapsList := gapsList.concat(["Demo Readiness below 50 (" # scores.demoReadiness.toText() # ")"]);
    let topMissing = missingItems.sliceToArray(0, Nat.min(3, missingItems.size()));
    for (item in topMissing.values()) {
      gapsList := gapsList.concat(["Missing: " # item]);
    };
    { verdict; emoji; why; technical_debt; strengths = strengthsList; criticalGaps = gapsList };
  };
};
