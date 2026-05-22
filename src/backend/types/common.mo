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

  /// Per-dimension score (0–10)
  public type Scores = {
    coverage     : Nat;   // % of required items matched
    stackMatch   : Nat;   // required tech present vs missing
    completeness : Nat;   // repo structure + components
    depth        : Nat;   // real implementation indicators
    docs         : Nat;   // README length + setup clarity
    demo         : Nat;   // demo link detected (0 or 10)
    aiUsage      : Nat;   // ai_log present (0 or 10)
  };

  /// Weight overrides applied per-evaluation from instruction parsing
  public type WeightOverrides = {
    coverage_mult     : Float;
    stack_mult        : Float;
    completeness_mult : Float;
    depth_mult        : Float;
    docs_mult         : Float;
    demo_mult         : Float;
    ai_mult           : Float;
    ignore_notes      : Bool;
    applied_instructions : [Text];
  };

  /// Recruiter's Verdict — non-technical decisive summary
  public type RecruiterVerdict = {
    verdict       : Text;   // "Highly Recommended" | "Proceed with Caution" | "Not Recommended"
    emoji         : Text;   // "✅" | "⚠️" | "❌"
    why           : Text;   // 2-sentence plain-English explanation
    technical_debt : Text;  // "Production Ready" | "Prototype Grade"
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
  };

  /// Parsed assignment produced by AI http-outcall (cached separately)
  public type ParsedAssignment = {
    role           : Text;
    required_items : [Text];
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
    readme_text       : Text;
    file_tree         : [Text];
    has_dockerfile    : Bool;
    has_compose       : Bool;
    has_ci            : Bool;
    has_terraform     : Bool;
    has_backend       : Bool;
    has_frontend      : Bool;
    has_auth          : Bool;
    has_db_config     : Bool;
    has_api_routes    : Bool;
    has_demo_link     : Bool;
    has_ai_log        : Bool;
    readme_word_count : Nat;
  };
};
