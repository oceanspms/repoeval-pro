import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type {
  EvaluationResult,
  RecruiterVerdict,
  Scores,
  Variant_fail_pass_caution,
} from "../types";
import { AlignmentBadge } from "./AlignmentBadge";
import { ScoreCard } from "./ScoreCard";

interface ResultReportProps {
  result: EvaluationResult;
}

const IS_MOCK_BACKEND = import.meta.env.VITE_USE_MOCK_BACKEND === "true";

function toNum(v: bigint): number {
  return Number(v);
}

function formatTimestamp(ts: bigint): string {
  const ms = Number(ts) > 1e12 ? Number(ts) / 1_000_000 : Number(ts) * 1000;
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Map backend variant verdict to PASS/CAUTION/FAIL display label */
function verdictLabel(
  v: Variant_fail_pass_caution | string,
): "PASS" | "CAUTION" | "FAIL" {
  const s = String(v).toLowerCase();
  if (s === "pass") return "PASS";
  if (s === "caution") return "CAUTION";
  return "FAIL";
}

/** Derive a full RecruiterVerdict from final_score when backend doesn't provide one */
function deriveVerdict(finalScore: number): RecruiterVerdict {
  if (finalScore >= 80) {
    return {
      emoji: "✅",
      verdict: "pass" as Variant_fail_pass_caution,
      why: "This candidate demonstrates strong alignment with the assignment requirements and solid technical execution across all evaluated dimensions.",
      technical_debt: "Production Ready",
      strengths: [],
      criticalGaps: [],
    };
  }
  if (finalScore >= 60) {
    return {
      emoji: "⚠️",
      verdict: "caution" as Variant_fail_pass_caution,
      why: "The submission shows partial alignment with the assignment — key areas are covered but notable gaps remain that should be addressed in the interview.",
      technical_debt: "Prototype Grade",
      strengths: [],
      criticalGaps: [],
    };
  }
  return {
    emoji: "❌",
    verdict: "fail" as Variant_fail_pass_caution,
    why: "The submission does not adequately meet the assignment requirements. Significant work is missing and the overall quality falls below the threshold for this role.",
    technical_debt: "Prototype Grade",
    strengths: [],
    criticalGaps: [],
  };
}

function verdictColors(label: "PASS" | "CAUTION" | "FAIL"): {
  wrapper: string;
  badge: string;
  debtPill: (debt: string) => string;
} {
  if (label === "PASS") {
    return {
      wrapper:
        "bg-[oklch(var(--chart-2)/0.08)] border-[oklch(var(--chart-2)/0.3)]",
      badge: "text-[oklch(var(--chart-2))]",
      debtPill: (debt) =>
        debt === "Production Ready"
          ? "bg-[oklch(var(--chart-2)/0.15)] text-[oklch(var(--chart-2))] border-[oklch(var(--chart-2)/0.3)]"
          : "bg-muted text-muted-foreground border-border",
    };
  }
  if (label === "CAUTION") {
    return {
      wrapper:
        "bg-[oklch(var(--chart-4)/0.08)] border-[oklch(var(--chart-4)/0.3)]",
      badge: "text-[oklch(var(--chart-4))]",
      debtPill: (debt) =>
        debt === "Production Ready"
          ? "bg-[oklch(var(--chart-2)/0.15)] text-[oklch(var(--chart-2))] border-[oklch(var(--chart-2)/0.3)]"
          : "bg-[oklch(var(--chart-4)/0.15)] text-[oklch(var(--chart-4))] border-[oklch(var(--chart-4)/0.3)]",
    };
  }
  return {
    wrapper:
      "bg-[oklch(var(--chart-1)/0.08)] border-[oklch(var(--chart-1)/0.3)]",
    badge: "text-[oklch(var(--chart-1))]",
    debtPill: () =>
      "bg-[oklch(var(--chart-1)/0.15)] text-[oklch(var(--chart-1))] border-[oklch(var(--chart-1)/0.3)]",
  };
}

/** Build a rule-based summary from scores — used when backend summary is absent */
function buildRuleBasedSummary(result: EvaluationResult): string[] {
  const final = toNum(result.final_score);
  const s: Scores = result.scores;

  const line1 =
    final >= 80
      ? "Strong submission with broad requirement coverage."
      : final >= 50
        ? "Partial implementation — key areas partially covered."
        : "Misaligned or significantly incomplete submission.";

  const categories: Array<{ label: string; score: number }> = [
    { label: "coverage", score: toNum(s.coverage) },
    { label: "stack match", score: toNum(s.stackMatch) },
    { label: "completeness", score: toNum(s.completeness) },
    { label: "depth", score: toNum(s.depth) },
    { label: "documentation", score: toNum(s.docs) },
    { label: "demo", score: toNum(s.demoReadiness) },
    { label: "AI usage", score: toNum(s.aiUsage) },
  ];

  const sorted = [...categories].sort((a, b) => b.score - a.score);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];

  const line2 = `Strongest area: ${strongest.label} (${strongest.score}/100).`;

  const firstMissing = result.missing_items[0];
  const missingPart = firstMissing
    ? ` Missing: ${firstMissing.toLowerCase()}.`
    : "";
  const line3 = `Weakest area: ${weakest.label} (${weakest.score}/100).${missingPart}`;

  const line4 =
    result.red_flags.length > 0
      ? `Top concern: ${result.red_flags[0]}`
      : final >= 80
        ? "Recommend proceeding to next evaluation stage."
        : "Recommend requesting demo or clarification on weak areas.";

  return [line1, line2, line3, line4];
}

function getSummaryLines(result: EvaluationResult): string[] {
  const backendSummary = result.summary?.trim() ?? "";
  if (backendSummary) {
    const parts = backendSummary
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (parts.length >= 1) return parts;
  }
  return buildRuleBasedSummary(result);
}

function buildPlainText(result: EvaluationResult): string {
  const s = result.scores;
  const lines_summary = getSummaryLines(result);
  const lines = [
    `Project Type: ${result.project_type}`,
    `Assignment Alignment: ${result.alignment}`,
    "",
    `Coverage:     ${toNum(s.coverage)}/100`,
    `Stack Match:  ${toNum(s.stackMatch)}/100`,
    `Completeness: ${toNum(s.completeness)}/100`,
    `Depth:        ${toNum(s.depth)}/100`,
    `Docs:         ${toNum(s.docs)}/100`,
    `Demo:         ${toNum(s.demoReadiness)}/100`,
    `AI Usage:     ${toNum(s.aiUsage)}/100`,
    "",
    `Final Score: ${toNum(result.final_score)}/100`,
    "",
    "Summary:",
    ...lines_summary,
    "",
    "Missing:",
    ...result.missing_items.slice(0, 8).map((m) => `- ${m}`),
    "",
    "Red Flags:",
    ...result.red_flags.slice(0, 5).map((f) => `- ${f}`),
  ];
  return lines.join("\n");
}

export function ResultReport({ result }: ResultReportProps) {
  const [copied, setCopied] = useState(false);
  const s = result.scores;
  const summaryLines = getSummaryLines(result);
  const finalScore = toNum(result.final_score);

  // Prefer backend verdict; fall back to client-side derivation
  const verdict: RecruiterVerdict =
    result.recruiter_verdict ?? deriveVerdict(finalScore);
  const label = verdictLabel(verdict.verdict);
  const colors = verdictColors(label);
  const appliedInstructions = result.applied_instructions ?? [];

  // Strengths and critical gaps — prefer verdict-level, fall back to result-level
  const strengths: string[] =
    (verdict.strengths?.length ? verdict.strengths : result.strengths) ?? [];
  const criticalGaps: string[] =
    (verdict.criticalGaps?.length
      ? verdict.criticalGaps
      : result.criticalGaps) ?? [];

  const scoreMetrics = [
    {
      label: "Coverage",
      score: toNum(s.coverage),
      ocid: "result.coverage_card",
    },
    {
      label: "Stack Match",
      score: toNum(s.stackMatch),
      ocid: "result.stack_match_card",
    },
    {
      label: "Completeness",
      score: toNum(s.completeness),
      ocid: "result.completeness_card",
    },
    { label: "Depth", score: toNum(s.depth), ocid: "result.depth_card" },
    { label: "Docs", score: toNum(s.docs), ocid: "result.docs_card" },
    { label: "Demo", score: toNum(s.demoReadiness), ocid: "result.demo_card" },
    {
      label: "AI Usage",
      score: toNum(s.aiUsage),
      ocid: "result.ai_usage_card",
    },
  ];

  const missing = result.missing_items.slice(0, 8);
  const redFlags = result.red_flags.slice(0, 5);

  async function handleCopy() {
    await navigator.clipboard.writeText(buildPlainText(result));
    setCopied(true);
    toast.success("Report copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      data-ocid="result.report"
      className="w-full max-w-2xl flex flex-col gap-4"
    >
      {/* ── Recruiter's Verdict ── */}
      <div
        data-ocid="result.recruiter_verdict"
        className={[
          "border rounded-lg px-5 py-4 flex flex-col gap-3",
          colors.wrapper,
        ].join(" ")}
      >
        {/* Verdict headline row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-2xl leading-none" aria-hidden="true">
            {verdict.emoji}
          </span>
          <span
            data-ocid="result.verdict_text"
            className={[
              "font-display font-bold text-base leading-tight",
              colors.badge,
            ].join(" ")}
          >
            {label}
          </span>
          {/* Alignment badge sits inline */}
          <AlignmentBadge alignment={result.alignment} />
          <span
            data-ocid="result.final_score_inline"
            className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full border bg-background/70 text-foreground border-border"
          >
            {finalScore}/100
          </span>
          <span
            data-ocid="result.role_inline"
            className="text-xs font-mono px-2 py-0.5 rounded-full border bg-background/70 text-muted-foreground border-border"
          >
            {result.project_type}
          </span>
          {IS_MOCK_BACKEND && (
            <span
              data-ocid="result.mock_mode_badge"
              className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-800 border-amber-300"
            >
              Mock Preview
            </span>
          )}
        </div>

        {/* Why */}
        <p className="text-sm leading-relaxed text-foreground/80">
          {verdict.why}
        </p>

        {/* Technical debt pill + Prompt log status */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            data-ocid="result.technical_debt_badge"
            className={[
              "text-xs font-medium px-2.5 py-1 rounded-full border",
              colors.debtPill(verdict.technical_debt),
            ].join(" ")}
          >
            {verdict.technical_debt}
          </span>
          {/* AI Usage dimension score — neutral display, no misleading Present/Absent */}
          <span
            data-ocid="result.prompt_log_badge"
            className="text-xs font-medium px-2.5 py-1 rounded-full border bg-muted/50 text-muted-foreground border-border"
          >
            {appliedInstructions.some((instr) => /prompt.?log/i.test(instr))
              ? `AI Usage: ${toNum(s.aiUsage)}/100 · Prompt log evaluated`
              : `AI Usage: ${toNum(s.aiUsage)}/100`}
          </span>
        </div>

        {/* Strengths & Critical Gaps from backend */}
        {(strengths.length > 0 || criticalGaps.length > 0) && (
          <div
            data-ocid="result.strengths_gaps"
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-current/10"
          >
            {strengths.length > 0 && (
              <div>
                <span className="text-[10px] uppercase tracking-widest font-mono text-[oklch(var(--chart-3))] font-semibold block mb-1.5">
                  Strengths
                </span>
                <ul className="flex flex-col gap-1">
                  {strengths.map((str, i) => (
                    <li
                      key={`strength-${str.slice(0, 24)}-${i}`}
                      data-ocid={`result.strength.item.${i + 1}`}
                      className="text-xs text-[oklch(var(--chart-3))] flex items-start gap-1.5"
                    >
                      <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[oklch(var(--chart-3))] flex-shrink-0" />
                      {str}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {criticalGaps.length > 0 && (
              <div>
                <span className="text-[10px] uppercase tracking-widest font-mono text-destructive font-semibold block mb-1.5">
                  Critical Gaps
                </span>
                <ul className="flex flex-col gap-1">
                  {criticalGaps.map((gap, i) => (
                    <li
                      key={`gap-${gap.slice(0, 24)}-${i}`}
                      data-ocid={`result.critical_gap.item.${i + 1}`}
                      className="text-xs text-destructive flex items-start gap-1.5"
                    >
                      <span className="mt-0.5 flex-shrink-0">⚠</span>
                      {gap}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Instructions applied (if any) */}
        {appliedInstructions.length > 0 && (
          <div
            data-ocid="result.applied_instructions"
            className="flex flex-col gap-1.5 pt-1 border-t border-current/10"
          >
            <span className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground font-semibold">
              Instructions Applied
            </span>
            <div className="flex flex-wrap gap-1.5">
              {appliedInstructions.map((instr, i) => (
                <span
                  key={`instr-${i}-${instr.slice(0, 20)}`}
                  data-ocid={`result.applied_instructions.item.${i + 1}`}
                  className="text-[11px] bg-background/60 border border-border px-2 py-0.5 rounded-full text-muted-foreground"
                >
                  {instr}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Header row ── */}
      <div className="bg-card border border-border rounded-lg px-5 py-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
                Project Type
              </span>
              <span
                data-ocid="result.project_type"
                className="text-xs font-mono font-semibold text-foreground bg-muted px-2 py-0.5 rounded"
              >
                {result.project_type}
              </span>
            </div>
          </div>

          <button
            type="button"
            data-ocid="result.copy_button"
            onClick={handleCopy}
            aria-label="Copy report to clipboard"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-accent/50 px-2.5 py-1.5 rounded-md transition-smooth"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-accent" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        {/* Metadata row */}
        <div className="flex items-center gap-3 pt-1 border-t border-border flex-wrap">
          <span className="text-[11px] text-muted-foreground font-mono">
            {formatTimestamp(result.timestamp)}
          </span>
          <span
            data-ocid="result.cache_badge"
            className={[
              "text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded",
              result.cached
                ? "bg-accent/10 text-accent border border-accent/20"
                : "bg-muted text-muted-foreground border border-border",
            ].join(" ")}
          >
            {result.cached ? "Cached" : "Fresh"}
          </span>
        </div>
      </div>

      {/* ── Summary ── */}
      <div
        data-ocid="result.summary"
        className="bg-card border border-border rounded-lg px-5 py-4"
      >
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-mono font-semibold mb-3">
          Summary
        </h3>
        <div className="flex flex-col gap-2">
          {summaryLines[0] && (
            <p
              data-ocid="result.summary.line1"
              className="text-sm leading-relaxed font-body text-foreground font-medium"
            >
              {summaryLines[0]}
            </p>
          )}
          {summaryLines[1] && (
            <p
              data-ocid="result.summary.line2"
              className="text-sm leading-relaxed font-body text-[oklch(var(--chart-3))]"
            >
              {summaryLines[1]}
            </p>
          )}
          {summaryLines[2] && (
            <p
              data-ocid="result.summary.line3"
              className="text-sm leading-relaxed font-body text-[oklch(var(--chart-4))]"
            >
              {summaryLines[2]}
            </p>
          )}
          {summaryLines[3] && (
            <p
              data-ocid="result.summary.line4"
              className="text-sm leading-relaxed font-body text-muted-foreground"
            >
              {summaryLines[3]}
            </p>
          )}
          {summaryLines[4] && (
            <p
              data-ocid="result.summary.line5"
              className="text-sm leading-relaxed font-body text-muted-foreground"
            >
              {summaryLines[4]}
            </p>
          )}
        </div>
      </div>

      {/* ── Final Score ── */}
      <div
        data-ocid="result.final_score_highlight"
        className="bg-accent/5 border border-accent/30 rounded-lg px-5 py-4 flex items-center justify-between"
      >
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-mono font-semibold mb-0.5">
            Final Score
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            Weighted evaluation score across assignment coverage, implementation quality, demo/docs, and AI evidence
          </p>
        </div>
        <div className="flex items-baseline gap-1">
          <span
            data-ocid="result.final_score_value"
            className={[
              "font-mono font-bold text-4xl leading-none",
              finalScore >= 70
                ? "text-[oklch(var(--chart-3))]"
                : finalScore >= 40
                  ? "text-[oklch(var(--chart-4))]"
                  : "text-destructive",
            ].join(" ")}
          >
            {finalScore}
          </span>
          <span className="font-mono text-muted-foreground text-lg">/100</span>
        </div>
      </div>

      {/* ── Score ribbon ── */}
      <div data-ocid="result.score_ribbon" className="metric-ribbon">
        {scoreMetrics.map((m) => (
          <ScoreCard
            key={m.label}
            label={m.label}
            score={m.score}
            data-ocid={m.ocid}
          />
        ))}
      </div>

      {/* ── Missing + Red Flags ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          data-ocid="result.missing_items"
          className="bg-card border border-border rounded-lg px-4 py-3.5 flex flex-col gap-2.5"
        >
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-mono font-semibold">
            Missing Items
          </h3>
          {missing.length === 0 ? (
            <p
              data-ocid="result.missing_items.empty_state"
              className="text-xs text-muted-foreground italic"
            >
              None — all requirements covered.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {missing.map((item, i) => (
                <li
                  key={item}
                  data-ocid={`result.missing_items.item.${i + 1}`}
                  className="text-xs text-foreground flex items-start gap-1.5"
                >
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-muted-foreground flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          data-ocid="result.red_flags"
          className="bg-card border border-destructive/20 rounded-lg px-4 py-3.5 flex flex-col gap-2.5"
        >
          <h3 className="text-xs uppercase tracking-wider text-destructive/80 font-mono font-semibold">
            Red Flags
          </h3>
          {redFlags.length === 0 ? (
            <p
              data-ocid="result.red_flags.empty_state"
              className="text-xs text-muted-foreground italic"
            >
              No critical issues detected.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {redFlags.map((flag, i) => (
                <li
                  key={flag}
                  data-ocid={`result.red_flags.item.${i + 1}`}
                  className="text-xs text-destructive flex items-start gap-1.5"
                >
                  <span className="mt-0.5 flex-shrink-0">⚠</span>
                  {flag}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
