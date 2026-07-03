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
        "setup instructions",
        "Docker support",
      ];
      core_items = ["REST API server", "authentication", "PostgreSQL persistence"];
      secondary_items = ["tests", "setup instructions", "Docker support"];
    };
    let completeBackendSignals : Types.RepoSignals = {
      baseSignals() with
      readme_text = "REST API server with authentication, PostgreSQL persistence, tests, setup instructions, and Docker support.";
      file_tree = ["src/server.ts", "src/routes/users.ts", "tests/server.test.ts", "Dockerfile"];
      has_backend = true;
      has_auth = true;
      has_db_config = true;
      has_api_routes = true;
      has_dockerfile = true;
      readme_word_count = 180;
      file_count = 24;
      test_count = 3;
      error_handler_count = 2;
    };
    let (completeBackendMatched, completeBackendMissing) = Scoring.matchRequirements(backendAssignment, completeBackendSignals);
    failures := failIf(completeBackendMissing.size() != 0, "complete backend fixture should match tests, setup, and Docker requirements", failures);
    failures := failIf(
      Scoring.coverageScore(completeBackendMatched, backendAssignment.required_items.size(), 0, 0) != 100,
      "complete backend fixture coverage should be 100",
      failures,
    );

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

    let fullRepoBackendAssignment : Types.ParsedAssignment = {
      role = "Backend";
      required_items = ["REST API server", "PostgreSQL persistence", "tests"];
      core_items = ["REST API server", "PostgreSQL persistence"];
      secondary_items = ["tests"];
    };
    let fullRepoSignals : Types.RepoSignals = {
      baseSignals() with
      readme_text = "Backend API service with PostgreSQL. Live API URL: https://example.com";
      file_tree = ["src/server.ts", "src/routes/tasks.ts", "src/App.tsx", "tests/api.test.ts", "package.json"];
      has_backend = true;
      has_frontend = true;
      has_api_routes = true;
      has_db_config = true;
      has_demo_link = true;
      has_working_demo_link = false;
      demo_url = ?"https://example.com";
      file_count = 32;
      readme_word_count = 140;
      test_count = 2;
    };
    failures := failIf(
      Scoring.projectType(fullRepoBackendAssignment, fullRepoSignals) != "Backend",
      "backend assignment must stay Backend even when repo also contains frontend files",
      failures,
    );
    failures := failIf(
      Scoring.demoScore(fullRepoSignals) > 50,
      "unverified live API/demo URL must remain weak evidence",
      failures,
    );
    let verifiedApiSignals : Types.RepoSignals = { fullRepoSignals with has_working_demo_link = true };
    failures := failIf(
      Scoring.demoScore(verifiedApiSignals) < 90,
      "verified live API/demo evidence should strongly improve run/deploy readiness",
      failures,
    );
    let verdictWithEvidence = Scoring.buildRecruiterVerdict(
      {
        coverage = 90;
        stackMatch = 100;
        completeness = 85;
        depth = 80;
        docs = 75;
        demoReadiness = 90;
        aiUsage = 60;
      },
      86,
      [],
      fullRepoBackendAssignment,
      verifiedApiSignals,
    );
    failures := failIf(
      not verdictWithEvidence.strengths.any(func(s) { s == "Live API evidence verified" }),
      "verified backend live URL should appear as concrete API evidence",
      failures,
    );

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

    let weightedScores : Types.Scores = {
      coverage = 40;
      stackMatch = 80;
      completeness = 80;
      depth = 80;
      docs = 80;
      demoReadiness = 80;
      aiUsage = 80;
    };
    let identityWeightedFinal = Scoring.finalScoreWithOverrides(weightedScores, { overrides with coverage_mult = 1.0 });
    let coverageWeightedFinal = Scoring.finalScoreWithOverrides(weightedScores, { overrides with coverage_mult = 2.0 });
    failures := failIf(identityWeightedFinal != Scoring.finalScore(weightedScores), "identity final-score overrides must preserve the base composite", failures);
    failures := failIf(coverageWeightedFinal >= identityWeightedFinal, "weighting weak coverage must lower the final score, not inflate coverage", failures);

    let fullstackAssignment : Types.ParsedAssignment = {
      role = "Fullstack";
      required_items = [
        "React frontend UI",
        "REST API server",
        "database persistence",
        "integration between frontend and backend",
      ];
      core_items = ["React frontend UI", "REST API server", "database persistence"];
      secondary_items = ["integration between frontend and backend"];
    };
    let fullstackSignals : Types.RepoSignals = {
      baseSignals() with
      file_tree = ["src/App.tsx", "server/routes/events.ts", "prisma/schema.prisma", "package.json"];
      has_frontend = true;
      has_backend = true;
      has_api_routes = true;
      has_db_config = true;
      file_count = 40;
      readme_word_count = 220;
      detected_frameworks = ["React", "Express"];
      has_scripts = true;
    };
    let (fullstackMatched, fullstackMissing) = Scoring.matchRequirements(fullstackAssignment, fullstackSignals);
    failures := failIf(fullstackMissing.size() != 0, "fullstack fixture should match frontend, backend, API, and database requirements", failures);
    failures := failIf(
      Scoring.coverageScore(fullstackMatched, fullstackAssignment.required_items.size(), 0, 0) != 100,
      "fullstack fixture coverage should be 100",
      failures,
    );

    let devopsAssignment : Types.ParsedAssignment = {
      role = "DevOps";
      required_items = ["Docker container setup", "CI/CD pipeline", "Terraform infrastructure"];
      core_items = ["Docker container setup", "CI/CD pipeline", "Terraform infrastructure"];
      secondary_items = [];
    };
    let devopsSignals : Types.RepoSignals = {
      baseSignals() with
      file_tree = ["Dockerfile", ".github/workflows/deploy.yml", "infra/main.tf"];
      has_dockerfile = true;
      has_ci = true;
      has_terraform = true;
      file_count = 12;
      readme_word_count = 150;
    };
    let (devopsMatched, devopsMissing) = Scoring.matchRequirements(devopsAssignment, devopsSignals);
    failures := failIf(devopsMissing.size() != 0, "devops fixture should match Docker, CI/CD, and IaC requirements", failures);
    failures := failIf(Scoring.stackMatchScore(devopsSignals, devopsAssignment) != 100, "devops stack match should be 100 with CI, Docker, and Terraform", failures);

    let currentAuditAssignment : Types.ParsedAssignment = {
      role = "Backend";
      required_items = [
        "Authentication with email OTP and JWT",
        "RBAC permissions and ownership",
        "Event and enrollment domain models",
        "Search and enrollment APIs",
        "README, tests, API docs, deployment evidence",
      ];
      core_items = [
        "Authentication with email OTP and JWT",
        "RBAC permissions and ownership",
        "Event and enrollment domain models",
        "Search and enrollment APIs",
      ];
      secondary_items = ["README, tests, API docs, deployment evidence"];
    };
    let weakAuditSignals : Types.RepoSignals = {
      baseSignals() with
      readme_text = "README with setup and AI prompt log.";
      file_tree = ["README.md", "Dockerfile", ".env.example"];
      has_dockerfile = true;
      has_env_example = true;
      has_ai_log = true;
      readme_word_count = 300;
      file_count = 3;
    };
    let (auditMatched, auditMissing) = Scoring.matchRequirements(currentAuditAssignment, weakAuditSignals);
    failures := failIf(auditMatched >= 3, "current audit baseline should not over-credit docs/deploy evidence as core implementation", failures);
    failures := failIf(auditMissing.size() < 3, "current audit baseline should expose missing core auth/RBAC/domain/API groups", failures);

    failures;
  };
};
