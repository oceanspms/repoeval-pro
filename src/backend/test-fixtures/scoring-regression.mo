import Scoring "../lib/scoring";
import Types "../types/common";

module {
  func baseSignals() : Types.RepoSignals {
    {
      readme_text = "";
      file_tree = [];
      has_dockerfile = false;
      has_compose = false;
      has_ci = false;
      has_terraform = false;
      has_backend = false;
      has_frontend = false;
      has_auth = false;
      has_db_config = false;
      has_api_routes = false;
      has_demo_link = false;
      has_working_demo_link = false;
      demo_url = null;
      has_ai_log = false;
      readme_word_count = 0;
      todo_count = 0;
      has_env_example = false;
      has_seed_data = false;
      has_setup_script = false;
      error_handler_count = 0;
      file_count = 0;
      detected_frameworks = [];
      todo_count_source = 0;
      test_count = 0;
      has_dockerfile_multistage = false;
      has_scripts = false;
      fetched_file_paths = [];
      key_file_summaries = [];
    };
  };

  func failIf(condition : Bool, message : Text, failures : [Text]) : [Text] {
    if (condition) failures.concat([message]) else failures;
  };

  public func run() : [Text] {
    var failures : [Text] = [];

    let frontendAssignment : Types.ParsedAssignment = {
      role = "Frontend";
      required_items = [
        "React frontend UI",
        "responsive layout",
        "documentation",
        "deployed demo link",
      ];
      core_items = ["React frontend UI", "responsive layout"];
      secondary_items = ["documentation", "deployed demo link"];
    };
    let frontendSignals : Types.RepoSignals = {
      baseSignals() with
      readme_text = "React frontend UI with responsive layout, documentation, and deployed demo link.";
      file_tree = ["src/App.tsx", "src/components/Dashboard.tsx", "package.json"];
      has_frontend = true;
      has_demo_link = true;
      readme_word_count = 120;
      file_count = 18;
      detected_frameworks = ["React"];
      has_scripts = true;
    };
    let (frontendMatched, frontendMissing) = Scoring.matchRequirements(frontendAssignment, frontendSignals);
    let frontendCoverage = Scoring.coverageScore(frontendMatched, frontendAssignment.required_items.size(), 0, 0);
    let frontendStack = Scoring.stackMatchScore(frontendSignals, frontendAssignment);
    failures := failIf(frontendMissing.size() != 0, "frontend fixture should match all declared requirements", failures);
    failures := failIf(frontendCoverage != 100, "frontend fixture coverage should be 100", failures);
    failures := failIf(frontendStack != 100, "frontend fixture stack match should not require backend/database", failures);

    failures := failIf(
      Scoring.coverageScore(0, 0, 0, 0) != 0,
      "empty parser/rubric coverage must be 0, not inflated",
      failures,
    );
    failures := failIf(
      Scoring.coverageScore(2, 3, 0, 0) != 66,
      "coverage must use matched/total even when parser misses core/secondary classification",
      failures,
    );

    let backendAssignment : Types.ParsedAssignment = {
      role = "Backend";
      required_items = [
        "REST API server",
        "authentication",
        "PostgreSQL persistence",
        "tests",
        "Docker support",
      ];
      core_items = ["REST API server", "authentication", "PostgreSQL persistence"];
      secondary_items = ["tests", "Docker support"];
    };
    let weakBackendSignals : Types.RepoSignals = {
      baseSignals() with
      readme_text = "Minimal placeholder server.";
      file_tree = ["README.md"];
      file_count = 1;
      readme_word_count = 20;
    };
    let (backendMatched, backendMissing) = Scoring.matchRequirements(backendAssignment, weakBackendSignals);
    let backendCoverage = Scoring.coverageScore(backendMatched, backendAssignment.required_items.size(), 3, 2);
    let backendStack = Scoring.stackMatchScore(weakBackendSignals, backendAssignment);
    failures := failIf(backendMissing.size() < 3, "weak backend fixture should miss mandatory backend items", failures);
    failures := failIf(backendCoverage > 40, "missing core backend requirements must materially reduce coverage", failures);
    failures := failIf(backendStack != 0, "backend stack match should be 0 when no backend/API/database signals exist", failures);

    let baseScores : Types.Scores = {
      coverage = 80;
      stackMatch = 80;
      completeness = 80;
      depth = 80;
      docs = 80;
      demoReadiness = 80;
      aiUsage = 80;
    };
    let overrides : Types.WeightOverrides = {
      coverage_mult = 0.5;
      stack_mult = 1.0;
      completeness_mult = 1.0;
      depth_mult = 1.0;
      docs_mult = 1.0;
      demoReadiness_mult = 1.0;
      ai_mult = 1.0;
      ignore_notes = false;
      ignore_prompt_log = false;
      applied_instructions = ["coverage half-weight"];
    };
    let adjusted = Scoring.applyWeightOverrides(baseScores, overrides);
    let adjustedFinal = Scoring.finalScore(adjusted);
    failures := failIf(adjusted.coverage != 40, "coverage override should be applied once", failures);
    failures := failIf(adjustedFinal != 73, "final score should use already-adjusted dimensions only", failures);

    failures;
  };
};
