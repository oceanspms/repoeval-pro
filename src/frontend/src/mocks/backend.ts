import { Variant_fail_pass_caution } from "../backend";
import type { 
  Alignment,
  EvaluationRecord,
  EvaluationResult,
  RoleStats,
  backendInterface,
 } from "../backend";

const sampleResult: EvaluationResult = {
  scores: {
    coverage: BigInt(90),
    stackMatch: BigInt(80),
    completeness: BigInt(90),
    depth: BigInt(70),
    docs: BigInt(80),
    demoReadiness: BigInt(30),
    aiUsage: BigInt(60),
  },
  summary:
    "Strong fullstack submission with excellent coverage (90/100) and solid documentation (80/100). The candidate demonstrates deep knowledge of the required stack with good completeness (90/100). The biggest gap is demo readiness (30/100) because no live demo or working prototype was provided. AI evidence is moderate (60/100). Overall a compelling submission that warrants an interview despite the demo gap.",
  missing_items: ["Live demo URL", "docker-compose.yml", "CI/CD pipeline config"],
  final_score: BigInt(78),
  timestamp: BigInt(Date.now()),
  cached: false,
  red_flags: ["No live demo found", "Missing docker-compose"],
  project_type: "Fullstack",
  alignment: "High" as unknown as Alignment,
  strengths: ["Coverage", "Completeness", "Stack Match"],
  criticalGaps: ["No live demo", "Missing docker-compose"],
  recruiter_verdict: {
    verdict: Variant_fail_pass_caution.pass,
    emoji: "✅",
    why:
      "This candidate built a production-grade fullstack app with clean code and thorough documentation. The only notable gap is the absence of a live demo, which is a minor concern given the overall quality.",
    technical_debt: "Production Ready",
    strengths: ["Coverage", "Completeness", "Stack Match"],
    criticalGaps: ["No live demo", "Missing docker-compose"],
  },
  applied_instructions: ["Weighted Dockerfile more heavily per recruiter notes"],
};

const sampleResult2: EvaluationResult = {
  scores: {
    coverage: BigInt(60),
    stackMatch: BigInt(50),
    completeness: BigInt(60),
    depth: BigInt(50),
    docs: BigInt(40),
    demoReadiness: BigInt(70),
    aiUsage: BigInt(80),
  },
  summary:
    "Moderate submission with a working demo (70/100) but limited documentation (40/100) and partial coverage (60/100). The candidate shows potential but the codebase has signs of being prototype-grade rather than production-ready. Stack alignment is partial (50/100) because several required frameworks are absent. Worth a follow-up technical screen to assess depth.",
  missing_items: ["Unit tests", "README", "API documentation"],
  final_score: BigInt(59),
  timestamp: BigInt(Date.now() - 86400000),
  cached: false,
  red_flags: ["No test files found", "README is empty"],
  project_type: "Frontend",
  alignment: "Medium" as unknown as Alignment,
  strengths: ["Demo Readiness", "AI Usage", "Coverage"],
  criticalGaps: ["Missing unit tests", "README is empty"],
  recruiter_verdict: {
    verdict: Variant_fail_pass_caution.caution,
    emoji: "⚠️",
    why:
      "The candidate delivered a working prototype but the codebase lacks tests and proper documentation. Good for a junior role but would need close mentoring.",
    technical_debt: "Prototype Grade",
    strengths: ["Demo Readiness", "AI Usage"],
    criticalGaps: ["Missing unit tests", "README is empty"],
  },
  applied_instructions: [],
};

const sampleResult3: EvaluationResult = {
  scores: {
    coverage: BigInt(30),
    stackMatch: BigInt(40),
    completeness: BigInt(30),
    depth: BigInt(20),
    docs: BigInt(20),
    demoReadiness: BigInt(10),
    aiUsage: BigInt(90),
  },
  summary:
    "Weak submission with critical gaps across all dimensions. Coverage is minimal (30/100), documentation is nearly absent (20/100), and no working demo was provided (10/100). Heavy AI evidence (90/100) means the candidate should be asked to explain ownership and implementation details. Not recommended for this role at this time.",
  missing_items: ["Working demo", "Unit tests", "README", "API docs", "docker-compose"],
  final_score: BigInt(30),
  timestamp: BigInt(Date.now() - 172800000),
  cached: false,
  red_flags: ["Possible AI-generated code", "No tests", "No documentation", "No demo"],
  project_type: "Backend",
  alignment: "Low" as unknown as Alignment,
  strengths: ["AI Usage detection"],
  criticalGaps: ["No demo", "No documentation", "Critical features missing"],
  recruiter_verdict: {
    verdict: Variant_fail_pass_caution.fail,
    emoji: "❌",
    why:
      "Too many gaps across all evaluation areas to justify moving forward. The submission does not meet the minimum bar for this position.",
    technical_debt: "Prototype Grade",
    strengths: [],
    criticalGaps: ["No demo", "No documentation", "Critical features missing"],
  },
  applied_instructions: [],
};

let mockHistory: EvaluationRecord[] = [
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

function ownerFromUrl(repoUrl: string): string {
  return (
    repoUrl
      .replace(/^https?:\/\/(www\.)?github\.com\//, "")
      .split("/")[0]
      ?.trim() || "candidate"
  );
}

function resultForRepo(repoUrl: string, index: number): EvaluationResult {
  const source = [sampleResult, sampleResult2, sampleResult3][index % 3];
  return {
    ...source,
    timestamp: BigInt(Date.now()),
    cached: false,
    project_type: index % 2 === 0 ? source.project_type : "Frontend",
    summary: `${source.summary}\n\nMock evaluation for ${repoUrl}.`,
  };
}

const roleStats: RoleStats[] = [
  {
    role: "Frontend",
    count: BigInt(3),
    avg_score: BigInt(70),
    max_score: BigInt(90),
    min_score: BigInt(50),
    avg_coverage: BigInt(70),
    avg_stack_match: BigInt(80),
    avg_completeness: BigInt(70),
    avg_depth: BigInt(60),
    avg_docs: BigInt(70),
    avg_demo: BigInt(80),
    avg_ai_usage: BigInt(50),
  },
  {
    role: "Backend",
    count: BigInt(2),
    avg_score: BigInt(60),
    max_score: BigInt(80),
    min_score: BigInt(40),
    avg_coverage: BigInt(60),
    avg_stack_match: BigInt(70),
    avg_completeness: BigInt(60),
    avg_depth: BigInt(70),
    avg_docs: BigInt(50),
    avg_demo: BigInt(40),
    avg_ai_usage: BigInt(60),
  },
  {
    role: "DevOps",
    count: BigInt(1),
    avg_score: BigInt(80),
    max_score: BigInt(80),
    min_score: BigInt(80),
    avg_coverage: BigInt(90),
    avg_stack_match: BigInt(80),
    avg_completeness: BigInt(80),
    avg_depth: BigInt(70),
    avg_docs: BigInt(80),
    avg_demo: BigInt(60),
    avg_ai_usage: BigInt(40),
  },
];

export const mockBackend: backendInterface = {
  getHistory: async () => [...mockHistory],
  getEvaluationById: async (id: string) =>
    mockHistory.find((r) => r.id === id)?.result ?? null,
  clearCache: async () => undefined,
  evaluate: async (
    repo_urls: string[],
    assignment_description: string,
    _optional_notes: string | null,
  ): Promise<EvaluationResult[]> => {
    const now = Date.now();
    const results = repo_urls.map((repoUrl, index) => {
      const result = resultForRepo(repoUrl, index);
      const record: EvaluationRecord = {
        id: `mock-${now}-${index}`,
        result,
        owner: ownerFromUrl(repoUrl),
        assignment_text: assignment_description,
        timestamp: result.timestamp,
        repo_url: repoUrl,
      };
      mockHistory = [record, ...mockHistory];
      return result;
    });
    return results;
  },
  getCacheStats: async () => ({
    entries: BigInt(mockHistory.length),
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
  getExportHistory: async () => [...mockHistory],
  getHistoryByRepo: async (repo_url: string) =>
    mockHistory.filter((record) => record.repo_url === repo_url),
  getRoleStats: async () => roleStats,
  deleteEvaluation: async (id: string) => {
    const before = mockHistory.length;
    mockHistory = mockHistory.filter((record) => record.id !== id);
    return mockHistory.length < before;
  },
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
