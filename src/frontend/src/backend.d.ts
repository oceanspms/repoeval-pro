import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface EvaluationResult {
    applied_instructions: Array<string>;
    scores: Scores;
    summary: string;
    missing_items: Array<string>;
    final_score: bigint;
    timestamp: Timestamp;
    cached: boolean;
    red_flags: Array<string>;
    project_type: string;
    alignment: Alignment;
    recruiter_verdict?: RecruiterVerdict;
}
export type ExtractTextResult = {
    __kind__: "ok";
    ok: {
        text: string;
        is_clean: boolean;
    };
} | {
    __kind__: "err";
    err: string;
};
export type Timestamp = bigint;
export interface TransformationOutput {
    status: bigint;
    body: Uint8Array;
    headers: Array<http_header>;
}
export interface TransformationInput {
    context: Uint8Array;
    response: http_request_result;
}
export interface RecruiterVerdict {
    why: string;
    emoji: string;
    verdict: string;
    technical_debt: string;
}
export interface Scores {
    stackMatch: bigint;
    demo: bigint;
    docs: bigint;
    coverage: bigint;
    completeness: bigint;
    depth: bigint;
    aiUsage: bigint;
}
export interface RoleStats {
    avg_stack_match: bigint;
    avg_completeness: bigint;
    count: bigint;
    role: string;
    avg_ai_usage: bigint;
    max_score: bigint;
    avg_score: bigint;
    min_score: bigint;
    avg_coverage: bigint;
    avg_depth: bigint;
    avg_demo: bigint;
    avg_docs: bigint;
}
export interface EvaluationRecord {
    id: string;
    result: EvaluationResult;
    owner: string;
    assignment_text: string;
    timestamp: Timestamp;
    repo_url: string;
}
export interface http_header {
    value: string;
    name: string;
}
export interface http_request_result {
    status: bigint;
    body: Uint8Array;
    headers: Array<http_header>;
}
export enum Alignment {
    Low = "Low",
    High = "High",
    Medium = "Medium"
}
export interface backendInterface {
    clearCache(): Promise<void>;
    deleteEvaluation(id: string): Promise<boolean>;
    evaluate(repo_urls: Array<string>, assignment_description: string, optional_notes: string | null): Promise<Array<EvaluationResult>>;
    /**
     * / Cache: evaluation results keyed by (repo_url | assignment_description)
     */
    extractFileText(fileBytes: Uint8Array, fileName: string): Promise<ExtractTextResult>;
    /**
     * / Persistent history store — survives canister upgrades via enhanced orthogonal persistence
     */
    extractNotesFileText(fileBytes: Uint8Array, fileName: string): Promise<ExtractTextResult>;
    fetchGoogleDocText(url: string): Promise<ExtractTextResult>;
    getCacheStats(): Promise<{
        entries: bigint;
        lastHit: boolean;
    }>;
    getEvaluationById(id: string): Promise<EvaluationResult | null>;
    getExportHistory(): Promise<Array<EvaluationRecord>>;
    getHistory(): Promise<Array<EvaluationRecord>>;
    getHistoryByRepo(repo_url: string): Promise<Array<EvaluationRecord>>;
    getRoleStats(): Promise<Array<RoleStats>>;
    getVersion(): Promise<string>;
    transform(input: TransformationInput): Promise<TransformationOutput>;
}
