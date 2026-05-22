import type { Alignment, EvaluationRecord, EvaluationResult, RoleStats, backendInterface } from "../backend";

const sampleResult: EvaluationResult = {
  scores: {
    coverage: BigInt(9),
    stackMatch: BigInt(8),
    completeness: BigInt(9),
    depth: BigInt(7),
    docs: BigInt(8),
    demo: BigInt(3),
    aiUsage: BigInt(6),
  },
  summary:
    "Strong fullstack submission with excellent coverage (9/10) and solid documentation (8/10). The candidate demonstrates deep knowledge of the required stack with good completeness (9/10). The biggest gap is demo quality (3/10) — no live demo or working prototype was provided. AI usage is moderate (6/10) which is within acceptable bounds. Overall a compelling submission that warrants an interview despite the demo gap.",
  missing_items: ["Live demo URL", "docker-compose.yml", "CI/CD pipeline config"],
  final_score: BigInt(9),
  timestamp: BigInt(Date.now()),
  cached: false,
  red_flags: ["No live demo found", "Missing docker-compose"],
  project_type: "Fullstack",
  alignment: "High" as unknown as Alignment,
  recruiter_verdict: {
    verdict: "Highly Recommended",
    emoji: "✅",
    why:
      "This candidate built a production-grade fullstack app with clean code and thorough documentation. The only notable gap is the absence of a live demo, which is a minor concern given the overall quality.",
    technical_debt: "Production Ready",
  },
  applied_instructions: ["Weighted Dockerfile more heavily per recruiter notes"],
};

const sampleResult2: EvaluationResult = {
  scores: {
    coverage: BigInt(6),
    stackMatch: BigInt(5),
    completeness: BigInt(6),
    depth: BigInt(5),
    docs: BigInt(4),
    demo: BigInt(7),
    aiUsage: BigInt(8),
  },
  summary:
    "Moderate submission with a working demo (7/10) but limited documentation (4/10) and partial coverage (6/10). The candidate shows potential but the codebase has signs of being prototype-grade rather than production-ready. Stack alignment is partial (5/10) — several required frameworks are absent. Worth a follow-up technical screen to assess depth.",
  missing_items: ["Unit tests", "README", "API documentation"],
  final_score: BigInt(7),
  timestamp: BigInt(Date.now() - 86400000),
  cached: false,
  red_flags: ["No test files found", "README is empty"],
  project_type: "Frontend",
  alignment: "Medium" as unknown as Alignment,
  recruiter_verdict: {
    verdict: "Proceed with Caution",
    emoji: "⚠️",
    why:
      "The candidate delivered a working prototype but the codebase lacks tests and proper documentation. Good for a junior role but would need close mentoring.",
    technical_debt: "Prototype Grade",
  },
  applied_instructions: [],
};

const sampleResult3: EvaluationResult = {
  scores: {
    coverage: BigInt(3),
    stackMatch: BigInt(4),
    completeness: BigInt(3),
    depth: BigInt(2),
    docs: BigInt(2),
    demo: BigInt(1),
    aiUsage: BigInt(9),
  },
  summary:
    "Weak submission with critical gaps across all dimensions. Coverage is minimal (3/10), documentation is nearly absent (2/10), and no working demo was provided (1/10). Heavy AI usage (9/10) suggests the candidate may not fully understand the codebase they submitted. Not recommended for this role at this time.",
  missing_items: ["Working demo", "Unit tests", "README", "API docs", "docker-compose"],
  final_score: BigInt(4),
  timestamp: BigInt(Date.now() - 172800000),
  cached: false,
  red_flags: ["Possible AI-generated code", "No tests", "No documentation", "No demo"],
  project_type: "Backend",
  alignment: "Low" as unknown as Alignment,
  recruiter_verdict: {
    verdict: "Not Recommended",
    emoji: "❌",
    why:
      "Too many gaps across all evaluation areas to justify moving forward. The submission does not meet the minimum bar for this position.",
    technical_debt: "Prototype Grade",
  },
  applied_instructions: [],
};

const sampleHistory: EvaluationRecord[] = [
  {
    id: "eval-001",
    result: sampleResult,
    owner: "sarah-dev",
    assignment_text: "Build a fullstack task management app with React and Node.js",
    timestamp: BigInt(Date.now()),
    repo_url: "https://github.com/sarah-dev/task-manager-pro",
  },
  {
    id: "eval-002",
    result: sampleResult2,
    owner: "john-codes",
    assignment_text: "Build a fullstack task management app with React and Node.js",
    timestamp: BigInt(Date.now() - 86400000),
    repo_url: "https://github.com/john-codes/taskapp",
  },
  {
    id: "eval-003",
    result: sampleResult3,
    owner: "alex-ml",
    assignment_text: "Build a REST API with authentication",
    timestamp: BigInt(Date.now() - 172800000),
    repo_url: "https://github.com/alex-ml/api-project",
  },
];

const roleStats: RoleStats[] = [
  {
    role: "Frontend",
    count: BigInt(3),
    avg_score: BigInt(7),
    max_score: BigInt(9),
    min_score: BigInt(5),
    avg_coverage: BigInt(7),
    avg_stack_match: BigInt(8),
    avg_completeness: BigInt(7),
    avg_depth: BigInt(6),
    avg_docs: BigInt(7),
    avg_demo: BigInt(8),
    avg_ai_usage: BigInt(5),
  },
  {
    role: "Backend",
    count: BigInt(2),
    avg_score: BigInt(6),
    max_score: BigInt(8),
    min_score: BigInt(4),
    avg_coverage: BigInt(6),
    avg_stack_match: BigInt(7),
    avg_completeness: BigInt(6),
    avg_depth: BigInt(7),
    avg_docs: BigInt(5),
    avg_demo: BigInt(4),
    avg_ai_usage: BigInt(6),
  },
  {
    role: "DevOps",
    count: BigInt(1),
    avg_score: BigInt(8),
    max_score: BigInt(8),
    min_score: BigInt(8),
    avg_coverage: BigInt(9),
    avg_stack_match: BigInt(8),
    avg_completeness: BigInt(8),
    avg_depth: BigInt(7),
    avg_docs: BigInt(8),
    avg_demo: BigInt(6),
    avg_ai_usage: BigInt(4),
  },
];

export const mockBackend: backendInterface = {
  getHistory: async () => sampleHistory,
  getEvaluationById: async (id: string) =>
    sampleHistory.find((r) => r.id === id)?.result ?? null,
  clearCache: async () => undefined,
  evaluate: async (
    _repo_urls: string[],
    _assignment_description: string,
    _optional_notes: string | null,
  ): Promise<EvaluationResult[]> => [sampleResult],
  getCacheStats: async () => ({
    entries: BigInt(3),
    lastHit: true,
  }),
  transform: async (_input) => ({
    status: BigInt(200),
    body: new Uint8Array(),
    headers: [],
  }),
  extractFileText: async (_fileBytes: Uint8Array, _fileName: string) => ({
    __kind__: "ok" as const,
    ok: {
      text: "Sample extracted assignment text: Build a fullstack task management app with React, Node.js, and PostgreSQL. Must include authentication, real-time updates, and comprehensive test coverage.",
      is_clean: true,
    },
  }),
  getExportHistory: async () => sampleHistory,
  getHistoryByRepo: async (_repo_url: string) => sampleHistory.slice(0, 1),
  getRoleStats: async () => roleStats,
  deleteEvaluation: async (_id: string) => true,
  extractNotesFileText: async (_fileBytes: Uint8Array, _fileName: string) => ({
    __kind__: "ok" as const,
    ok: {
      text: "Additional notes: Weight the Dockerfile more heavily. Focus on backend architecture quality.",
      is_clean: true,
    },
  }),
  fetchGoogleDocText: async (_url: string) => ({
    __kind__: "ok" as const,
    ok: {
      text: "Google Doc content: Candidate notes and additional context from the interview process.",
      is_clean: true,
    },
  }),
  getVersion: async () => "v14",
};
