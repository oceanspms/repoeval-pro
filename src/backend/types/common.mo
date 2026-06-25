module {
  /// Result type for file text extraction — includes is_clean flag for junk detection
  public type ExtractTextResult = { #ok : { text : Text; is_clean : Bool }; #err : Text };

  /// A deterministic hash key derived from repo_url + assignment_description
  public type CacheKey = Text;

  /// Unix-style timestamp in nanoseconds (from Time.now())
  public type Timestamp = Int;

  /// Alignment verdict
  public type Alignment = {
    #High;
    #Medium;
    #Low;
  };

  /// Per-dimension score (0–100)
  public type Scores = {
    coverage     : Nat;   // % of required items matched (0-100)
    stackMatch   : Nat;   // required tech present vs missing (0-100)
    completeness : Nat;   // repo structure + components (0-100)
    depth        : Nat;   // real implementation indicators (0-100)
    docs         : Nat;   // README length + setup clarity (0-100)
    demoReadiness : Nat;  // demo/setup readiness (0-100, graduated)
    aiUsage      : Nat;   // ai usage signal (0-100)
  };

  /// Weight overrides applied per-evaluation from instruction parsing
  public type WeightOverrides = {
    coverage_mult        : Float;
    stack_mult           : Float;
    completeness_mult    : Float;
    depth_mult           : Float;
    docs_mult            : Float;
    demoReadiness_mult   : Float;
    ai_mult              : Float;
    ignore_notes         : Bool;
    ignore_prompt_log    : Bool;
    applied_instructions : [Text];
  };

  /// Recruiter's Verdict — non-technical decisive summary
  public type RecruiterVerdict = {
    verdict        : { #pass; #caution; #fail };  // strict variant
    emoji          : Text;   // "✅" | "⚠️" | "❌"
    why            : Text;   // 2-sentence plain-English explanation
    technical_debt : Text;   // "Production Ready" | "Needs Work" | "Prototype Grade"
    strengths      : [Text]; // dimensions >= 70
    criticalGaps   : [Text]; // dimensions < 50 or missing items
  };

  /// Fully structured evaluation report (public / shared type)
  public type EvaluationResult = {
    project_type          : Text;
    alignment             : Alignment;
    scores                : Scores;
    final_score           : Nat;
    missing_items         : [Text];
    red_flags             : [Text];
    summary               : Text;
    cached                : Bool;
    timestamp             : Timestamp;
    recruiter_verdict     : ?RecruiterVerdict;
    applied_instructions  : [Text];
    strengths             : [Text];  // dimensions >= 70 with label
    criticalGaps          : [Text];  // dimensions < 50 or missing items
  };

  /// Parsed assignment produced by AI http-outcall (cached separately)
  public type ParsedAssignment = {
    role            : Text;
    required_items  : [Text];  // all required items (union of core + secondary)
    core_items      : [Text];  // core/critical requirements (missing = -20 coverage)
    secondary_items : [Text];  // optional/secondary requirements (missing = -5 coverage)
  };

  /// Persistent history record for a completed evaluation
  public type EvaluationRecord = {
    id              : Text;          // unique id = nanosecond timestamp at evaluation time
    owner           : Text;          // GitHub repo owner (username), extracted from repo_url
    repo_url        : Text;
    assignment_text : Text;
    result          : EvaluationResult;
    timestamp       : Timestamp;
  };

  /// Per-role aggregate statistics across all evaluations in history
  public type RoleStats = {
    role             : Text;
    count            : Nat;
    avg_score        : Nat;   // multiplied by 10 for 1-decimal precision (e.g. 75 = 7.5)
    min_score        : Nat;
    max_score        : Nat;
    avg_coverage     : Nat;   // multiplied by 10
    avg_stack_match  : Nat;   // multiplied by 10
    avg_completeness : Nat;   // multiplied by 10
    avg_depth        : Nat;   // multiplied by 10
    avg_docs         : Nat;   // multiplied by 10
    avg_demo         : Nat;   // multiplied by 10
    avg_ai_usage     : Nat;   // multiplied by 10
  };

  /// Raw signals extracted from the GitHub repo (not exposed publicly)
  public type RepoSignals = {
    readme_text         : Text;
    file_tree           : [Text];
    has_dockerfile      : Bool;
    has_compose         : Bool;
    has_ci              : Bool;
    has_terraform       : Bool;
    has_backend         : Bool;
    has_frontend        : Bool;
    has_auth            : Bool;
    has_db_config       : Bool;
    has_api_routes      : Bool;
    has_demo_link       : Bool;
    has_working_demo_link : Bool;  // true only when demo URL was verified via HTTP (200 OK)
    demo_url            : ?Text;   // the extracted demo URL from README, if any
    has_ai_log          : Bool;
    readme_word_count   : Nat;
    // Extended signals for 0-100 scoring
    todo_count          : Nat;   // number of TODO/FIXME in repo
    has_env_example     : Bool;  // .env.example or .env.sample present
    has_seed_data       : Bool;  // seeds/ or seed.sql or similar
    has_setup_script    : Bool;  // Makefile, setup.sh, start.sh
    error_handler_count : Nat;   // estimated error handler occurrences
    file_count          : Nat;   // total files in tree
    // Deep source file crawling signals (new)
    detected_frameworks   : [Text];          // actual framework names from package.json
    todo_count_source     : Nat;             // TODOs found in fetched source files (not just README)
    test_count            : Nat;             // number of test functions found across test files
    has_dockerfile_multistage : Bool;        // multi-stage Docker = production-grade
    has_scripts           : Bool;            // package.json has scripts.start or scripts.dev
    fetched_file_paths    : [Text];          // which source files were actually read
    key_file_summaries    : [(Text, Text)];  // list of (filepath, short_summary)
  };
};
