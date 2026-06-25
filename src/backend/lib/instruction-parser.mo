import Types "../types/common";

/// Pure, stateless instruction parser.
/// Scans notes text for command keywords and returns WeightOverrides.
/// Fully deterministic — same input always produces same output.
module {

  /// Default (identity) weight overrides — no adjustments.
  func _defaults() : Types.WeightOverrides = {
    coverage_mult        = 1.0;
    stack_mult           = 1.0;
    completeness_mult    = 1.0;
    depth_mult           = 1.0;
    docs_mult            = 1.0;
    demoReadiness_mult   = 1.0;
    ai_mult              = 1.0;
    ignore_notes         = false;
    ignore_prompt_log    = false;
    applied_instructions = [];
  };

  /// Parse a notes/prompt-log text string for weight-override keywords.
  /// Returns a WeightOverrides record with all applicable multipliers set.
  /// All comparisons are lowercased for determinism.
  public func parseInstructions(notesText : Text) : Types.WeightOverrides {
    let lower = notesText.toLower();

    var coverage_mult      : Float = 1.0;
    var stack_mult         : Float = 1.0;
    var completeness_mult  : Float = 1.0;
    var depth_mult         : Float = 1.0;
    var docs_mult          : Float = 1.0;
    var demoReadiness_mult : Float = 1.0;
    let ai_mult            : Float = 1.0;
    var ignore_notes       : Bool  = false;
    var ignore_prompt_log  : Bool  = false;
    var instructions       : [Text] = [];

    // ── ignore notes ─────────────────────────────────────────────────────────
    if (lower.contains(#text "ignore notes")) {
      ignore_notes := true;
      instructions := instructions.concat(["ignore_notes"]);
    };

    // ── ignore prompt log / skip ai ─────────────────────────────────────────
    if (lower.contains(#text "ignore prompt log") or lower.contains(#text "skip ai") or lower.contains(#text "ignore ai")) {
      ignore_prompt_log := true;
      instructions := instructions.concat(["ignore_prompt_log"]);
    };

    // ── docker / dockerfile / demo readiness weighting ──────────────────────
    if (lower.contains(#text "weight dockerfile") or
        lower.contains(#text "weight demo") or
        lower.contains(#text "prioritize docker") or
        lower.contains(#text "focus on docker")) {
      demoReadiness_mult := Float.max(demoReadiness_mult, 2.0);
      instructions := instructions.concat(["weight_demo_readiness"]);
    };

    // ── coverage weighting ───────────────────────────────────────────────────
    if (lower.contains(#text "weight coverage") or lower.contains(#text "prioritize coverage")) {
      coverage_mult := 2.0;
      instructions := instructions.concat(["weight_coverage"]);
    };

    // ── docs / documentation weighting ──────────────────────────────────────
    if (lower.contains(#text "weight docs") or
        lower.contains(#text "weight documentation") or
        lower.contains(#text "prioritize documentation")) {
      docs_mult := Float.max(docs_mult, 2.0);
      instructions := instructions.concat(["weight_docs"]);
    };

    // ── frontend / UI weighting ──────────────────────────────────────────────
    if (lower.contains(#text "weight frontend") or lower.contains(#text "prioritize ui")) {
      stack_mult        := Float.max(stack_mult, 1.5);
      completeness_mult := Float.max(completeness_mult, 1.5);
      instructions := instructions.concat(["weight_frontend"]);
    };

    // ── tests / testing weighting ────────────────────────────────────────────
    if (lower.contains(#text "weight tests") or lower.contains(#text "focus on testing")) {
      depth_mult        := Float.max(depth_mult, 1.5);
      completeness_mult := Float.max(completeness_mult, 1.5);
      instructions := instructions.concat(["weight_tests"]);
    };

    // ── API / backend weighting ──────────────────────────────────────────────
    if (lower.contains(#text "weight api") or lower.contains(#text "focus on backend")) {
      stack_mult := Float.max(stack_mult, 1.5);
      depth_mult := Float.max(depth_mult, 1.5);
      instructions := instructions.concat(["weight_api"]);
    };

    {
      coverage_mult;
      stack_mult;
      completeness_mult;
      depth_mult;
      docs_mult;
      demoReadiness_mult;
      ai_mult;
      ignore_notes;
      ignore_prompt_log;
      applied_instructions = instructions;
    };
  };
};
