import {
  Alignment,
  Variant_fail_pass_caution,
  type EvaluationRecord,
  type EvaluationResult,
  type ExtractTextResult,
  type RoleStats,
  type backendInterface,
} from "../backend";

type JsonValue = Record<string, unknown>;

function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.trim()) return BigInt(value);
  return BigInt(0);
}

function alignment(value: unknown): Alignment {
  if (value === "High") return Alignment.High;
  if (value === "Medium") return Alignment.Medium;
  return Alignment.Low;
}

function verdict(value: unknown): Variant_fail_pass_caution {
  if (value === "pass") return Variant_fail_pass_caution.pass;
  if (value === "caution") return Variant_fail_pass_caution.caution;
  return Variant_fail_pass_caution.fail;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function normalizeResult(raw: JsonValue): EvaluationResult {
  const scores = (raw.scores ?? {}) as JsonValue;
  const recruiter = raw.recruiter_verdict as JsonValue | undefined;
  return {
    applied_instructions: strings(raw.applied_instructions),
    strengths: strings(raw.strengths),
    scores: {
      coverage: toBigInt(scores.coverage),
      stackMatch: toBigInt(scores.stackMatch),
      completeness: toBigInt(scores.completeness),
      depth: toBigInt(scores.depth),
      docs: toBigInt(scores.docs),
      demoReadiness: toBigInt(scores.demoReadiness),
      aiUsage: toBigInt(scores.aiUsage),
    },
    summary: String(raw.summary ?? ""),
    missing_items: strings(raw.missing_items),
    final_score: toBigInt(raw.final_score),
    timestamp: toBigInt(raw.timestamp),
    cached: Boolean(raw.cached),
    red_flags: strings(raw.red_flags),
    project_type: String(raw.project_type ?? "General"),
    alignment: alignment(raw.alignment),
    recruiter_verdict: recruiter
      ? {
          verdict: verdict(recruiter.verdict),
          emoji: String(recruiter.emoji ?? ""),
          why: String(recruiter.why ?? ""),
          technical_debt: String(recruiter.technical_debt ?? ""),
          strengths: strings(recruiter.strengths),
          criticalGaps: strings(recruiter.criticalGaps),
        }
      : undefined,
    criticalGaps: strings(raw.criticalGaps),
  };
}

function normalizeRecord(raw: JsonValue): EvaluationRecord {
  return {
    id: String(raw.id ?? ""),
    owner: String(raw.owner ?? ""),
    repo_url: String(raw.repo_url ?? ""),
    assignment_text: String(raw.assignment_text ?? ""),
    timestamp: toBigInt(raw.timestamp),
    result: normalizeResult((raw.result ?? {}) as JsonValue),
  };
}

function normalizeRoleStats(raw: JsonValue): RoleStats {
  return {
    role: String(raw.role ?? "General"),
    count: toBigInt(raw.count),
    avg_score: toBigInt(raw.avg_score),
    min_score: toBigInt(raw.min_score),
    max_score: toBigInt(raw.max_score),
    avg_coverage: toBigInt(raw.avg_coverage),
    avg_stack_match: toBigInt(raw.avg_stack_match),
    avg_completeness: toBigInt(raw.avg_completeness),
    avg_depth: toBigInt(raw.avg_depth),
    avg_docs: toBigInt(raw.avg_docs),
    avg_demo: toBigInt(raw.avg_demo),
    avg_ai_usage: toBigInt(raw.avg_ai_usage),
  };
}

function extractResult(raw: JsonValue): ExtractTextResult {
  if (raw.kind === "ok") {
    return {
      __kind__: "ok",
      ok: {
        text: String((raw.ok as JsonValue | undefined)?.text ?? ""),
        is_clean: Boolean((raw.ok as JsonValue | undefined)?.is_clean ?? true),
      },
    };
  }
  return {
    __kind__: "err",
    err: String(raw.err ?? "Could not extract text."),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function createRestBackend(apiBase = "/api"): backendInterface {
  const base = apiBase.replace(/\/$/, "");

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        typeof payload?.error === "string" ? payload.error : "Backend request failed.",
      );
    }
    return payload as T;
  }

  return {
    clearCache: async () => {
      await request("/clear-cache", { method: "POST", body: "{}" });
    },
    deleteEvaluation: async (id: string) => {
      const result = await request<{ deleted: boolean }>(
        `/history/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      return result.deleted;
    },
    evaluate: async (repo_urls, assignment_description, optional_notes) => {
      const results = await request<JsonValue[]>("/evaluate", {
        method: "POST",
        body: JSON.stringify({
          repo_urls,
          assignment_description,
          optional_notes,
        }),
      });
      return results.map(normalizeResult);
    },
    extractFileText: async (fileBytes, fileName) => {
      const result = await request<JsonValue>("/extract-file", {
        method: "POST",
        body: JSON.stringify({ fileBytes: bytesToBase64(fileBytes), fileName }),
      });
      return extractResult(result);
    },
    extractNotesFileText: async (fileBytes, fileName) => {
      const result = await request<JsonValue>("/extract-notes-file", {
        method: "POST",
        body: JSON.stringify({ fileBytes: bytesToBase64(fileBytes), fileName }),
      });
      return extractResult(result);
    },
    fetchGoogleDocText: async (url) => {
      const result = await request<JsonValue>("/fetch-google-doc", {
        method: "POST",
        body: JSON.stringify({ url }),
      });
      return extractResult(result);
    },
    getCacheStats: async () => {
      const result = await request<JsonValue>("/cache-stats");
      return {
        entries: toBigInt(result.entries),
        lastHit: Boolean(result.lastHit),
      };
    },
    getEvaluationById: async (id) => {
      const result = await request<JsonValue | null>(
        `/history/${encodeURIComponent(id)}`,
      );
      return result ? normalizeResult(result) : null;
    },
    getExportHistory: async () => {
      const records = await request<JsonValue[]>("/export-history");
      return records.map(normalizeRecord);
    },
    getHistory: async () => {
      const records = await request<JsonValue[]>("/history");
      return records.map(normalizeRecord);
    },
    getHistoryByRepo: async (repo_url) => {
      const records = await request<JsonValue[]>(
        `/history/repo?url=${encodeURIComponent(repo_url)}`,
      );
      return records.map(normalizeRecord);
    },
    getRoleStats: async () => {
      const stats = await request<JsonValue[]>("/role-stats");
      return stats.map(normalizeRoleStats);
    },
    getVersion: async () => {
      const result = await request<JsonValue>("/version");
      return String(result.version ?? "netlify-rest-v1");
    },
    transform: async () => ({
      status: BigInt(200),
      body: new Uint8Array(),
      headers: [],
    }),
  };
}
