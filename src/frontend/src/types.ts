import type {
  Alignment,
  EvaluationResult,
  RecruiterVerdict,
  Scores,
} from "./backend";

export type { Alignment, EvaluationResult, RecruiterVerdict, Scores };

export type { RoleStats } from "./backend";

export interface CacheStats {
  entries: bigint;
  lastHit: boolean;
}

export interface EvaluationFormData {
  repoUrls: string[];
  assignmentDescription: string;
  optionalNotes: string;
}

export type Theme = "dark" | "light";

export type Tab = "eval" | "history" | "reporting";

export interface WeightOverrides {
  coverage_mult: number;
  stack_mult: number;
  completeness_mult: number;
  depth_mult: number;
  docs_mult: number;
  demo_mult: number;
  ai_mult: number;
  ignore_notes: boolean;
  applied_instructions: string[];
}

export interface EvaluationRecord {
  id: string;
  repo_url: string;
  assignment_text: string;
  result: EvaluationResult;
  timestamp: bigint;
  owner: string;
}

/** Backend returns EvaluationRecord without owner until DID is regenerated */
export type BackendEvaluationRecord = Omit<EvaluationRecord, "owner"> & {
  owner?: string;
};
