import { useMemo } from "react";
import type { EvaluationRecord } from "../types";
import { getRoleFromRecord } from "./useReporting";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KPIs {
  total: number;
  avgScore: number;
  passRate: number;
  cautionRate: number;
  failRate: number;
  topScore: number;
  topOwner: string;
}

export interface RoleBarDatum {
  name: string;
  avgScore: number;
  count: number;
}

export interface TrendDatum {
  date: string;
  score: number;
  owner: string;
  role: string;
  rawMs: number;
}

export interface VerdictDatum {
  name: string;
  value: number;
  key: "pass" | "caution" | "fail";
}

export interface MetricDatum {
  dimension: string;
  avg: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toMs(ts: bigint): number {
  // Nanoseconds (ICP timestamps) or ms fallback
  return Number(ts) > 1e15 ? Number(ts) / 1_000_000 : Number(ts);
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const METRIC_LABELS: Record<string, string> = {
  coverage: "Coverage",
  stackMatch: "Stack Match",
  completeness: "Completeness",
  depth: "Depth",
  docs: "Documentation",
  demoReadiness: "Demo",
  aiUsage: "AI Usage",
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDashboard(
  filteredRecords: EvaluationRecord[],
  allRecords: EvaluationRecord[],
) {
  /** KPI cards — always computed from filteredRecords */
  const kpis = useMemo<KPIs>(() => {
    const total = filteredRecords.length;
    if (total === 0) {
      return {
        total: 0,
        avgScore: 0,
        passRate: 0,
        cautionRate: 0,
        failRate: 0,
        topScore: 0,
        topOwner: "—",
      };
    }
    let sum = 0;
    let pass = 0;
    let caution = 0;
    let fail = 0;
    let topScore = Number.NEGATIVE_INFINITY;
    let topOwner = "—";

    for (const r of filteredRecords) {
      const s = Number(r.result.final_score);
      sum += s;
      // verdict-based: use backend verdict if available, else threshold
      const vRaw = r.result.recruiter_verdict?.verdict;
      const v = vRaw ? String(vRaw).toLowerCase() : null;
      if (v === "pass" || (!v && s >= 80)) pass++;
      else if (v === "caution" || (!v && s >= 60)) caution++;
      else fail++;
      if (s > topScore) {
        topScore = s;
        topOwner = r.owner?.trim() || "—";
      }
    }

    return {
      total,
      avgScore: Number.parseFloat((sum / total).toFixed(2)),
      passRate: Number.parseFloat(((pass / total) * 100).toFixed(1)),
      cautionRate: Number.parseFloat(((caution / total) * 100).toFixed(1)),
      failRate: Number.parseFloat(((fail / total) * 100).toFixed(1)),
      topScore: Number.parseFloat(topScore.toFixed(1)),
      topOwner,
    };
  }, [filteredRecords]);

  /** Role bar chart — always computed from allRecords so bar chart has all roles */
  const roleBarData = useMemo<RoleBarDatum[]>(() => {
    const map = new Map<string, { sum: number; count: number }>();
    for (const r of allRecords) {
      const role = getRoleFromRecord(r);
      const s = Number(r.result.final_score);
      const prev = map.get(role) ?? { sum: 0, count: 0 };
      map.set(role, { sum: prev.sum + s, count: prev.count + 1 });
    }
    return [...map.entries()]
      .map(([name, { sum, count }]) => ({
        name,
        avgScore: Number.parseFloat((sum / count).toFixed(2)),
        count,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);
  }, [allRecords]);

  /** Trend line chart — filteredRecords sorted by date */
  const trendData = useMemo<TrendDatum[]>(() => {
    return [...filteredRecords]
      .map((r) => {
        const ms = toMs(r.timestamp);
        return {
          date: formatDate(ms),
          score: Number.parseFloat(Number(r.result.final_score).toFixed(2)),
          owner: r.owner?.trim() || "—",
          role: getRoleFromRecord(r),
          rawMs: ms,
        };
      })
      .sort((a, b) => a.rawMs - b.rawMs);
  }, [filteredRecords]);

  /** Verdict donut — from filteredRecords */
  const verdictData = useMemo<VerdictDatum[]>(() => {
    let pass = 0;
    let caution = 0;
    let fail = 0;
    for (const r of filteredRecords) {
      const s = Number(r.result.final_score);
      const vRaw = r.result.recruiter_verdict?.verdict;
      const v = vRaw ? String(vRaw).toLowerCase() : null;
      if (v === "pass" || (!v && s >= 80)) pass++;
      else if (v === "caution" || (!v && s >= 60)) caution++;
      else fail++;
    }
    const out: VerdictDatum[] = [];
    if (pass > 0) out.push({ name: "PASS", value: pass, key: "pass" });
    if (caution > 0)
      out.push({
        name: "CAUTION",
        value: caution,
        key: "caution",
      });
    if (fail > 0) out.push({ name: "FAIL", value: fail, key: "fail" });
    return out;
  }, [filteredRecords]);

  /** 7-dimension radar/bar breakdown — from filteredRecords */
  const metricBreakdown = useMemo<MetricDatum[]>(() => {
    const keys = Object.keys(METRIC_LABELS) as (keyof typeof METRIC_LABELS)[];
    if (filteredRecords.length === 0) {
      return keys.map((k) => ({ dimension: METRIC_LABELS[k], avg: 0 }));
    }
    return keys.map((key) => {
      const sum = filteredRecords.reduce((acc, r) => {
        const val = r.result?.scores?.[key as keyof typeof r.result.scores];
        return acc + (val !== undefined ? Number(val) : 0);
      }, 0);
      return {
        dimension: METRIC_LABELS[key],
        avg: Number.parseFloat((sum / filteredRecords.length).toFixed(2)),
      };
    });
  }, [filteredRecords]);

  return { kpis, roleBarData, trendData, verdictData, metricBreakdown };
}
