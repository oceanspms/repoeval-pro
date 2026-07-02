import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  Award,
  BarChart2,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Loader2,
  PlayCircle,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDashboard } from "../hooks/useDashboard";
import { useExportHistory } from "../hooks/useExportHistory";
import { getRoleFromRecord, useReporting } from "../hooks/useReporting";
import type { EvaluationRecord, RecruiterVerdict } from "../types";

// ─── Color helpers ────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 70) return CHART_COLORS.green;
  if (score >= 40) return CHART_COLORS.yellow;
  return CHART_COLORS.red;
}

// Fixed CSS variable colors for recharts (oklch doesn't parse in SVG)
const CHART_COLORS = {
  cyan: "#22d3ee",
  blue: "#818cf8",
  green: "#4ade80",
  yellow: "#facc15",
  red: "#f87171",
};

const VERDICT_COLORS: Record<string, string> = {
  pass: CHART_COLORS.green,
  caution: CHART_COLORS.yellow,
  fail: CHART_COLORS.red,
};

// Placeholder colours — clearly distinct from real data
const PLACEHOLDER_BAR_COLOR = "#c7d2fe"; // indigo-200, clearly muted but visible
const PLACEHOLDER_LINE_COLOR = "#a5b4fc"; // indigo-300
const PLACEHOLDER_DONUT_COLORS = ["#c7d2fe", "#ddd6fe", "#e9d5ff"];

// ─── Score Badge ──────────────────────────────────────────────────────────────

function scoreBadgeClasses(score: number): string {
  if (score >= 70) return "text-[#4ade80] bg-[#4ade80]/10 border-[#4ade80]/30";
  if (score >= 40) return "text-[#facc15] bg-[#facc15]/10 border-[#facc15]/30";
  return "text-[#f87171] bg-[#f87171]/10 border-[#f87171]/30";
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <span
      className={[
        "inline-flex items-center font-mono font-bold text-xs px-2 py-0.5 rounded border shrink-0",
        scoreBadgeClasses(score),
      ].join(" ")}
    >
      {Math.round(score)}/100
    </span>
  );
}

// ─── Verdict Badge ────────────────────────────────────────────────────────────

function deriveVerdict(score: number): { verdict: string; emoji: string } {
  if (score >= 80) return { verdict: "PASS", emoji: "✅" };
  if (score >= 60) return { verdict: "CAUTION", emoji: "⚠️" };
  return { verdict: "FAIL", emoji: "❌" };
}

function VerdictBadge({ record }: { record: EvaluationRecord }) {
  const score = Number(record.result.final_score);
  const backendVerdict = record.result.recruiter_verdict?.verdict;
  // Map backend Motoko variant enum (lowercase) to display label
  const verdictDisplayMap: Record<string, { emoji: string; verdict: string }> =
    {
      pass: { emoji: "✅", verdict: "PASS" },
      caution: { emoji: "⚠️", verdict: "CAUTION" },
      fail: { emoji: "❌", verdict: "FAIL" },
    };
  const displayed = backendVerdict
    ? (verdictDisplayMap[String(backendVerdict)] ?? deriveVerdict(score))
    : deriveVerdict(score);
  const { emoji, verdict } = displayed;
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-muted/50 border border-border text-foreground font-medium shrink-0">
      <span aria-hidden="true">{emoji}</span>
      <span className="hidden sm:inline truncate max-w-[110px]">{verdict}</span>
    </span>
  );
}

// ─── Candidate Brief ──────────────────────────────────────────────────────────

function generateCandidateBrief(record: EvaluationRecord): void {
  const score = Number(record.result.final_score);
  const { emoji, verdict } = deriveVerdict(score);
  const role = getRoleFromRecord(record);
  const tsMs =
    Number(record.timestamp) > 1e12
      ? Number(record.timestamp) / 1_000_000
      : Number(record.timestamp) * 1000;
  const date = new Date(tsMs).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const scores = record.result.scores;
  const fmt = (v: bigint) => Number(v).toFixed(1);
  const summaryLines = record.result.summary
    ? record.result.summary
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    : [];
  const missingItems = record.result.missing_items ?? [];
  const redFlags = record.result.red_flags ?? [];
  const debtLabel =
    score >= 80
      ? "Production Ready"
      : score >= 60
        ? "Needs Polish"
        : "Prototype Grade";

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<title>Candidate Brief — @${record.owner || "Unknown"}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f4f6f9;padding:2rem;color:#1a1a2e}.card{background:#fff;border-radius:12px;max-width:680px;margin:0 auto;padding:2rem;box-shadow:0 4px 24px rgba(0,0,0,.08)}.header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:1.5rem;border-bottom:2px solid #e8ecf0;padding-bottom:1rem}.title{font-size:1.25rem;font-weight:700;color:#0f172a}.subtitle{font-size:.8rem;color:#64748b;margin-top:.2rem;font-family:monospace}.score-badge{font-size:1.5rem;font-weight:800;padding:.4rem .9rem;border-radius:8px;font-family:monospace;text-align:center}.score-green{background:#dcfce7;color:#166534;border:1px solid #86efac}.score-yellow{background:#fef9c3;color:#854d0e;border:1px solid #fde047}.score-red{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5}.verdict{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:.8rem 1rem;margin-bottom:1.25rem}.verdict-title{font-size:.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.3rem}.verdict-value{font-size:1rem;font-weight:700}.section{margin-bottom:1.2rem}.section-title{font-size:.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.5rem}.scores-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem}.score-cell{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:.4rem .5rem;text-align:center}.score-cell .label{font-size:.65rem;color:#94a3b8}.score-cell .value{font-size:.9rem;font-weight:700;font-family:monospace;color:#1e293b}.tag{display:inline-block;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;padding:.15rem .5rem;font-size:.72rem;color:#475569;margin:.15rem}.tag.red{background:#fee2e2;border-color:#fca5a5;color:#991b1b}.summary p{font-size:.85rem;color:#334155;line-height:1.5;margin-bottom:.35rem}.footer{display:flex;justify-content:space-between;font-size:.72rem;color:#94a3b8;padding-top:.8rem;margin-top:1rem;border-top:1px solid #e2e8f0}</style>
</head>
<body><div class="card">
<div class="header"><div><div class="title">@${record.owner || "Unknown"}</div><div class="subtitle">${record.repo_url}</div><div style="margin-top:.4rem;font-size:.78rem;color:#64748b">Role: <strong>${role}</strong> &nbsp;·&nbsp; Evaluated: <strong>${date}</strong></div></div>
<div class="score-badge ${score >= 80 ? "score-green" : score >= 60 ? "score-yellow" : "score-red"}">${score.toFixed(1)}<span style="font-size:.9rem;font-weight:400">/100</span></div></div>
<div class="verdict"><div class="verdict-title">Recruiter's Verdict</div><div class="verdict-value">${emoji} ${verdict}</div><div style="margin-top:.4rem;font-size:.78rem;color:#64748b">${debtLabel}</div></div>
<div class="section summary"><div class="section-title">Summary</div>${summaryLines.map((l) => `<p>${l}</p>`).join("")}</div>
<div class="section"><div class="section-title">Score Breakdown</div><div class="scores-grid">
<div class="score-cell"><div class="label">Coverage</div><div class="value">${fmt(scores.coverage)}</div></div>
<div class="score-cell"><div class="label">Stack</div><div class="value">${fmt(scores.stackMatch)}</div></div>
<div class="score-cell"><div class="label">Complete</div><div class="value">${fmt(scores.completeness)}</div></div>
<div class="score-cell"><div class="label">Depth</div><div class="value">${fmt(scores.depth)}</div></div>
<div class="score-cell"><div class="label">Docs</div><div class="value">${fmt(scores.docs)}</div></div>
<div class="score-cell"><div class="label">Demo</div><div class="value">${fmt(scores.demoReadiness)}</div></div>
<div class="score-cell"><div class="label">AI Usage</div><div class="value">${fmt(scores.aiUsage)}</div></div>
<div class="score-cell"><div class="label">Alignment</div><div class="value" style="font-size:.75rem">${record.result.alignment}</div></div>
</div></div>
${missingItems.length > 0 ? `<div class="section"><div class="section-title">Missing Items</div><div>${missingItems.map((item) => `<span class="tag">${item}</span>`).join("")}</div></div>` : ""}
${redFlags.length > 0 ? `<div class="section"><div class="section-title">Red Flags</div><div>${redFlags.map((f) => `<span class="tag red">${f}</span>`).join("")}</div></div>` : ""}
<div class="footer"><span>Generated by RepoEval Pro</span><span>${new Date().toLocaleDateString()}</span></div>
</div></body></html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = (record.owner || "candidate")
    .replace(/[^a-z0-9]/gi, "-")
    .toLowerCase();
  a.download = `candidate-brief-${safe}.html`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Chart Tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      {label && (
        <p className="text-muted-foreground mb-1 font-medium">{label}</p>
      )}
      {payload.map((p) => (
        <p
          key={p.name}
          className="font-mono font-semibold"
          style={{ color: p.color ?? "inherit" }}
        >
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
        </p>
      ))}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accentColor: string;
  ocid: string;
  isEmpty?: boolean;
  emptyHint?: string;
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  accentColor,
  ocid,
  isEmpty,
  emptyHint,
}: KpiCardProps) {
  return (
    <div
      data-ocid={ocid}
      className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 relative overflow-hidden"
      style={{
        borderTopColor: accentColor,
        borderTopWidth: "3px",
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
          {label}
        </p>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{
            backgroundColor: `${accentColor}18`,
            opacity: isEmpty ? 0.5 : 0.85,
          }}
        >
          <span style={{ color: accentColor }}>{icon}</span>
        </div>
      </div>
      <div>
        <p
          className="font-mono font-bold text-2xl leading-tight"
          style={{ color: isEmpty ? "#94a3b8" : accentColor }}
        >
          {value}
        </p>
        {isEmpty && emptyHint ? (
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
            {emptyHint}
          </p>
        ) : sub ? (
          <p className="text-[11px] text-muted-foreground mt-1 truncate leading-relaxed">
            {sub}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ─── Chart Card ───────────────────────────────────────────────────────────────

function ChartCard({
  title,
  subtitle,
  children,
  ocid,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  ocid: string;
}) {
  return (
    <div
      data-ocid={ocid}
      className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4"
    >
      <div className="flex flex-col gap-0.5">
        <h3 className="font-display font-semibold text-sm text-foreground">
          {title}
        </h3>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Empty Chart Overlay ──────────────────────────────────────────────────────

function EmptyChartOverlay({
  message,
  detail,
}: { message: string; detail?: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div className="bg-card/95 border border-border shadow-sm rounded-xl px-5 py-4 mx-4 text-center max-w-xs backdrop-blur-sm">
        <p className="text-sm font-semibold text-foreground leading-snug">
          {message}
        </p>
        {detail && (
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Role Bar Chart ───────────────────────────────────────────────────────────

const PLACEHOLDER_ROLES = [
  { name: "Backend", avgScore: 0, count: 0 },
  { name: "Frontend", avgScore: 0, count: 0 },
  { name: "DevOps", avgScore: 0, count: 0 },
  { name: "QA", avgScore: 0, count: 0 },
  { name: "ML", avgScore: 0, count: 0 },
];

function RoleBarChart({
  data,
}: { data: Array<{ name: string; avgScore: number; count: number }> }) {
  const isEmpty = data.length === 0;
  const chartData = isEmpty ? PLACEHOLDER_ROLES : data;
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={chartData}
          margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(128,128,128,0.15)"
            vertical={false}
          />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          {!isEmpty && (
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ fill: "rgba(128,128,128,0.08)" }}
            />
          )}
          <Bar
            dataKey="avgScore"
            name="Avg Score"
            radius={[4, 4, 0, 0]}
            minPointSize={isEmpty ? 32 : 0}
          >
            {chartData.map((entry) => (
              <Cell
                key={entry.name}
                fill={
                  isEmpty ? PLACEHOLDER_BAR_COLOR : scoreColor(entry.avgScore)
                }
                opacity={isEmpty ? 0.55 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {isEmpty && (
        <EmptyChartOverlay
          message="Role scores will appear here"
          detail="Each role you evaluate gets its own bar, color-coded by average score."
        />
      )}
    </div>
  );
}

// ─── Trend Line Chart ─────────────────────────────────────────────────────────

const PLACEHOLDER_TREND = [
  { date: "Jan", score: 0, owner: "" },
  { date: "Feb", score: 0, owner: "" },
  { date: "Mar", score: 0, owner: "" },
  { date: "Apr", score: 0, owner: "" },
  { date: "May", score: 0, owner: "" },
];

function TrendLineChart({
  data,
}: { data: Array<{ date: string; score: number; owner: string }> }) {
  const isEmpty = data.length < 2;
  const chartData = isEmpty ? PLACEHOLDER_TREND : data;
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart
          data={chartData}
          margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(128,128,128,0.15)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          {!isEmpty && <Tooltip content={<ChartTooltip />} />}
          <Line
            type="monotone"
            dataKey="score"
            name="Final Score"
            stroke={isEmpty ? PLACEHOLDER_LINE_COLOR : CHART_COLORS.cyan}
            strokeWidth={isEmpty ? 2 : 2.5}
            strokeDasharray={isEmpty ? "6 4" : undefined}
            dot={
              isEmpty
                ? false
                : { r: 4, fill: CHART_COLORS.cyan, strokeWidth: 0 }
            }
            activeDot={isEmpty ? false : { r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
      {isEmpty && (
        <EmptyChartOverlay
          message="Score trend over time"
          detail="Run 2+ evaluations and a trend line will trace candidate quality across your hiring window."
        />
      )}
    </div>
  );
}

// ─── Verdict Donut Chart ──────────────────────────────────────────────────────

const RADIAN = Math.PI / 180;

function renderCustomLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
}) {
  if (percent < 0.08) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={700}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

function VerdictDonut({
  data,
}: { data: Array<{ name: string; value: number; key: string }> }) {
  const isEmpty = data.length === 0;

  if (isEmpty) {
    const placeholderData = [
      { name: "Hire ✅", value: 1, key: "pass" },
      { name: "Caution ⚠️", value: 1, key: "caution" },
      { name: "No Hire ❌", value: 1, key: "fail" },
    ];
    return (
      <div className="relative">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={placeholderData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={3}
              dataKey="value"
              labelLine={false}
              isAnimationActive={false}
              strokeDasharray="6 3"
              stroke="#e2e8f0"
              strokeWidth={2}
            >
              {placeholderData.map((entry, idx) => (
                <Cell key={entry.key} fill={PLACEHOLDER_DONUT_COLORS[idx]} />
              ))}
            </Pie>
            <Legend
              iconSize={10}
              iconType="circle"
              formatter={(value) => (
                <span style={{ fontSize: 11, color: "#94a3b8" }}>
                  {value} — 0%
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -58%)",
          }}
        >
          <p className="text-xs font-semibold text-foreground text-center whitespace-nowrap">
            Run first eval
          </p>
          <p className="text-[10px] text-muted-foreground text-center whitespace-nowrap mt-0.5">
            to see split
          </p>
        </div>
        <EmptyChartOverlay
          message="Verdict breakdown will appear here"
          detail="Shows Hire / Caution / No Hire split across all evaluations."
        />
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={3}
          dataKey="value"
          labelLine={false}
          label={renderCustomLabel}
        >
          {data.map((entry) => (
            <Cell
              key={entry.key}
              fill={VERDICT_COLORS[entry.key] ?? CHART_COLORS.cyan}
            />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend
          iconSize={10}
          iconType="circle"
          formatter={(value) => (
            <span style={{ fontSize: 11, color: "#94a3b8" }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── Metric Bar (horizontal) ──────────────────────────────────────────────────

function MetricBarBreakdown({
  data,
}: { data: Array<{ dimension: string; avg: number }> }) {
  const hasData = data.some((d) => d.avg > 0);
  return (
    <div className="relative flex flex-col gap-2.5 py-1">
      {data.map((item) => (
        <div key={item.dimension} className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-xs text-muted-foreground text-right">
            {item.dimension}
          </span>
          <div className="flex-1 h-2.5 bg-muted/40 rounded-full overflow-hidden border border-border/20">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: hasData ? `${item.avg}%` : "6%",
                backgroundColor: hasData
                  ? scoreColor(item.avg)
                  : PLACEHOLDER_BAR_COLOR,
                opacity: hasData ? 1 : 0.7,
              }}
            />
          </div>
          <span
            className="w-10 shrink-0 font-mono text-xs font-bold"
            style={{ color: hasData ? scoreColor(item.avg) : "#94a3b8" }}
          >
            {hasData ? item.avg.toFixed(1) : "—"}
          </span>
        </div>
      ))}
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-card/95 border border-border shadow-sm rounded-xl px-4 py-3 mx-2 text-center max-w-[180px] backdrop-blur-sm">
            <p className="text-xs font-semibold text-foreground leading-snug">
              7-dimension breakdown
            </p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
              Scores fill in after your first evaluation
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Metric Radar ─────────────────────────────────────────────────────────────

function MetricRadarChart({
  data,
}: { data: Array<{ dimension: string; avg: number }> }) {
  const hasData = data.some((d) => d.avg > 0);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius={80}>
        <PolarGrid stroke="rgba(128,128,128,0.15)" />
        <PolarAngleAxis
          dataKey="dimension"
          tick={{ fontSize: 10, fill: "#94a3b8" }}
        />
        <Radar
          name="Avg Score"
          dataKey="avg"
          stroke={hasData ? CHART_COLORS.cyan : PLACEHOLDER_LINE_COLOR}
          fill={hasData ? CHART_COLORS.cyan : PLACEHOLDER_BAR_COLOR}
          fillOpacity={hasData ? 0.25 : 0.18}
          strokeWidth={hasData ? 2 : 1.5}
          strokeDasharray={hasData ? undefined : "4 3"}
          isAnimationActive={hasData}
        />
        {hasData && <Tooltip content={<ChartTooltip />} />}
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

function formatDate(ts: bigint): string {
  const ms = ts / 1_000_000n;
  return new Date(Number(ms)).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function shortRepo(url: string): string {
  return url
    .replace(/^https?:\/\/(www\.)?github\.com\//, "")
    .replace(/\/$/, "");
}

function TableRow({
  record,
  index,
}: { record: EvaluationRecord; index: number }) {
  const score = Number(record.result.final_score);
  const owner =
    record.owner?.trim() || shortRepo(record.repo_url).split("/")[0] || "—";
  const role = getRoleFromRecord(record);
  return (
    <tr
      data-ocid={`reporting.item.${index}`}
      className="border-b border-border/50 hover:bg-muted/20 transition-colors"
    >
      <td className="px-4 py-3 text-sm font-semibold text-foreground">
        <span className="flex flex-col gap-0.5">
          <span>@{owner}</span>
          <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[160px]">
            {shortRepo(record.repo_url)}
          </span>
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs bg-muted/60 border border-border px-1.5 py-0.5 rounded font-medium text-muted-foreground">
          {role}
        </span>
      </td>
      <td className="px-4 py-3">
        <ScoreBadge score={score} />
      </td>
      <td className="px-4 py-3">
        <VerdictBadge record={record} />
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">
        {formatDate(record.timestamp)}
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          data-ocid={`reporting.brief_button.${index}`}
          title="Generate Candidate Brief"
          aria-label="Generate Candidate Brief"
          onClick={() => generateCandidateBrief(record)}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          <FileText className="w-3 h-3" />
          <span className="hidden sm:inline">Brief</span>
        </button>
      </td>
    </tr>
  );
}

// ─── Getting Started Banner ───────────────────────────────────────────────────

function GettingStartedBanner() {
  return (
    <div
      data-ocid="reporting.getting_started"
      className="flex items-start gap-4 px-5 py-5 rounded-xl border-2 border-dashed"
      style={{
        borderColor: "#818cf8",
        background: "linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)",
      }}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "#818cf820" }}
      >
        <PlayCircle className="w-6 h-6" style={{ color: "#818cf8" }} />
      </div>
      <div className="flex flex-col gap-1 min-w-0">
        <p className="text-base font-bold text-foreground">
          Your analytics dashboard is ready
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Run your first evaluation from the{" "}
          <strong style={{ color: "#818cf8" }}>New Evaluation</strong> tab. KPI
          cards, role charts, trend lines, verdict breakdown, and the
          7-dimension skill radar will all populate automatically — no setup
          required.
        </p>
        <div className="flex flex-wrap gap-3 mt-2">
          {[
            "📊 Role bar charts",
            "📈 Score trend line",
            "🎯 Verdict donut",
            "🔬 Skill breakdown",
            "🏆 KPI summary",
          ].map((chip) => (
            <span
              key={chip}
              className="text-xs px-2.5 py-1 rounded-full border font-medium"
              style={{
                borderColor: "#818cf850",
                background: "#818cf812",
                color: "#818cf8",
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard Section ────────────────────────────────────────────────────────

function DashboardSection({
  filteredRecords,
  allRecords,
  selectedRole,
  isLoading,
}: {
  filteredRecords: EvaluationRecord[];
  allRecords: EvaluationRecord[];
  selectedRole: string;
  isLoading: boolean;
}) {
  const { kpis, roleBarData, trendData, verdictData, metricBreakdown } =
    useDashboard(filteredRecords, allRecords);

  const noData = allRecords.length === 0;

  const metricSubtitle =
    selectedRole === "All"
      ? "Average across all evaluations"
      : `Average for ${selectedRole} evaluations`;

  return (
    <div
      data-ocid="dashboard.section"
      className={`flex flex-col gap-5 transition-opacity duration-300 ${isLoading ? "opacity-60" : "opacity-100"}`}
    >
      {/* ── Getting Started Banner (zero evals, not loading) ─────────────── */}
      {noData && !isLoading && <GettingStartedBanner />}

      {/* ── KPI Grid ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          ocid="dashboard.kpi.total"
          label="Total Evaluations"
          value={String(kpis.total)}
          sub={noData ? undefined : `${allRecords.length} across all roles`}
          isEmpty={noData}
          emptyHint="Number of candidates evaluated so far"
          icon={<Users className="w-4 h-4" />}
          accentColor={CHART_COLORS.cyan}
        />
        <KpiCard
          ocid="dashboard.kpi.avg_score"
          label="Avg Final Score"
          value={kpis.total > 0 ? kpis.avgScore.toFixed(1) : "—"}
          sub={noData ? undefined : "Out of 100 — higher is better"}
          isEmpty={noData}
          emptyHint="Average score out of 100 across all evals"
          icon={<BarChart2 className="w-4 h-4" />}
          accentColor={CHART_COLORS.blue}
        />
        <KpiCard
          ocid="dashboard.kpi.pass_rate"
          label="Pass Rate"
          value={kpis.total > 0 ? `${kpis.passRate}%` : "—"}
          sub={noData ? undefined : "Score ≥ 80"}
          isEmpty={noData}
          emptyHint="% of candidates scoring ≥ 80 (Hire)"
          icon={<CheckCircle2 className="w-4 h-4" />}
          accentColor={CHART_COLORS.green}
        />
        <KpiCard
          ocid="dashboard.kpi.caution_rate"
          label="Caution Rate"
          value={kpis.total > 0 ? `${kpis.cautionRate}%` : "—"}
          sub={noData ? undefined : "Score 60-79"}
          isEmpty={noData}
          emptyHint="% of candidates in the 60–79 range"
          icon={<AlertTriangle className="w-4 h-4" />}
          accentColor={CHART_COLORS.yellow}
        />
        <KpiCard
          ocid="dashboard.kpi.top_score"
          label="Top Score"
          value={kpis.total > 0 ? `${kpis.topScore}/100` : "—"}
          sub={
            noData
              ? undefined
              : kpis.total > 0
                ? `@${kpis.topOwner}`
                : "No evaluations yet"
          }
          isEmpty={noData}
          emptyHint="Highest scoring candidate's result"
          icon={<Award className="w-4 h-4" />}
          accentColor="#e879f9"
        />
      </div>

      {/* Fail rate ribbon */}
      {kpis.total > 0 && kpis.failRate > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/20 w-fit">
          <XCircle className="w-4 h-4 text-destructive shrink-0" />
          <span className="text-xs text-destructive font-medium">
            {kpis.failRate}% Not Recommended — scores below 60
          </span>
        </div>
      )}

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Average Score by Role"
          subtitle={
            noData
              ? "Will show bars for each role you evaluate"
              : "Color-coded: green ≥70 · yellow ≥40 · red <40"
          }
          ocid="dashboard.chart.role_bar"
        >
          <RoleBarChart data={roleBarData} />
        </ChartCard>

        <ChartCard
          title="Score Trend Over Time"
          subtitle={
            noData
              ? "Tracks how candidate quality changes over your hiring window"
              : selectedRole === "All"
                ? "All roles combined"
                : `${selectedRole} role only`
          }
          ocid="dashboard.chart.trend"
        >
          <TrendLineChart data={trendData} />
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Verdict Distribution"
          subtitle={
            noData
              ? "Hire / Caution / No Hire split across all evaluations"
              : "Hiring recommendation breakdown"
          }
          ocid="dashboard.chart.verdict_donut"
        >
          <VerdictDonut data={verdictData} />
        </ChartCard>

        <ChartCard
          title="7-Dimension Skill Breakdown"
          subtitle={
            noData
              ? "Coverage · Stack · Completeness · Depth · Docs · Demo · AI Usage"
              : metricSubtitle
          }
          ocid="dashboard.chart.radar"
        >
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-center">
            <MetricRadarChart data={metricBreakdown} />
            <MetricBarBreakdown data={metricBreakdown} />
          </div>
        </ChartCard>
      </div>

      {/* Trend ribbon */}
      {trendData.length >= 2 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/5 border border-accent/20 w-fit">
          <TrendingUp className="w-4 h-4 text-accent shrink-0" />
          <span className="text-xs text-accent font-medium">
            {trendData.length} evaluations shown · {trendData[0]?.date} →{" "}
            {trendData[trendData.length - 1]?.date}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ReportingPage() {
  const {
    filteredRecords,
    allRecords,
    availableRoles,
    selectedRole,
    setRole,
    isLoading,
    error,
    refetch,
  } = useReporting();

  const {
    downloadFullSummary,
    downloadRoleReport,
    isLoading: isExportLoading,
  } = useExportHistory();

  const sorted = [...filteredRecords].sort(
    (a, b) => Number(b.result.final_score) - Number(a.result.final_score),
  );

  const roleReportLabel =
    selectedRole === "All"
      ? "Download Role Report"
      : `Download ${selectedRole} Report`;

  return (
    <div data-ocid="reporting.page" className="flex flex-col gap-6">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl px-6 py-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-center shrink-0">
              <BarChart2 className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1 className="font-display font-bold text-xl text-foreground">
                Reporting Center
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {allRecords.length > 0
                  ? `Analytics dashboard · ${allRecords.length} evaluation${allRecords.length === 1 ? "" : "s"} across ${availableRoles.length - 1 || 0} role${(availableRoles.length - 1) !== 1 ? "s" : ""}`
                  : "Dashboard preview — run your first evaluation to start seeing analytics."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              data-ocid="reporting.export_all_button"
              disabled={isExportLoading || allRecords.length === 0}
              onClick={() => void downloadFullSummary()}
              className="flex items-center gap-1.5 text-xs h-8 px-3"
            >
              {isExportLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Download All
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-ocid="reporting.role_report_button"
              disabled={isExportLoading || allRecords.length === 0}
              onClick={() =>
                void downloadRoleReport(selectedRole, availableRoles)
              }
              className="flex items-center gap-1.5 text-xs h-8 px-3"
            >
              {isExportLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <BarChart2 className="w-3.5 h-3.5" />
              )}
              {roleReportLabel}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Role Filter Pills ─────────────────────────────────────────────── */}
      <fieldset
        data-ocid="reporting.role_filter"
        className="flex flex-wrap gap-2 border-none p-0 m-0"
        aria-label="Filter by role"
      >
        <legend className="sr-only">Filter by role</legend>
        {availableRoles.map((role) => (
          <button
            key={role}
            type="button"
            data-ocid={`reporting.role_filter.${role.toLowerCase().replace(/\s+/g, "_")}`}
            onClick={() => setRole(role)}
            disabled={allRecords.length === 0}
            className={[
              "px-4 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200",
              selectedRole === role
                ? "bg-accent text-accent-foreground border-accent shadow-sm"
                : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-accent/50 hover:bg-muted/30",
              allRecords.length === 0 ? "opacity-40 cursor-not-allowed" : "",
            ].join(" ")}
          >
            {role}
            {role !== "All" && allRecords.length > 0 && (
              <span className="ml-1.5 opacity-60 font-mono text-[10px]">
                (
                {allRecords.filter((r) => getRoleFromRecord(r) === role).length}
                )
              </span>
            )}
          </button>
        ))}
      </fieldset>

      {/* ── Content ──────────────────────────────────────────────────────── */}

      {/* Inline loading indicator — shown as a small overlay, never hides the dashboard */}
      {isLoading && (
        <div
          data-ocid="reporting.loading_state"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border w-fit text-xs text-muted-foreground"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          Loading evaluation data…
        </div>
      )}

      {/* Error banner — shown inline above dashboard, never replaces it */}
      {error && !isLoading && (
        <div
          data-ocid="reporting.error_state"
          className="flex items-center gap-3 px-4 py-3 rounded-xl border border-destructive/30 bg-destructive/5"
        >
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <span className="text-sm text-destructive flex-1">
            Could not load evaluation data — showing cached results.
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 px-2 text-destructive hover:bg-destructive/10"
            onClick={() => void refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {/* ── Dashboard Charts + KPIs — ALWAYS rendered ───────────────────── */}
      <DashboardSection
        filteredRecords={filteredRecords}
        allRecords={allRecords}
        selectedRole={selectedRole}
        isLoading={isLoading}
      />

      {/* ── Divider ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mt-2">
        <div className="flex-1 border-t border-border/50" />
        <span className="text-xs text-muted-foreground font-semibold px-3 shrink-0 bg-background">
          Candidate Comparison Table
        </span>
        <div className="flex-1 border-t border-border/50" />
      </div>

      {/* ── Batch Table ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                    Owner / Repo
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                    Role
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                    Score
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                    Verdict
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                    Date
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3].map((i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-4 py-3">
                      <Skeleton className="h-8 w-36 rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-16 rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-14 rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-28 rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-20 rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-6 w-12 rounded" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : sorted.length === 0 ? (
        <div
          data-ocid="reporting.table_empty_state"
          className="bg-card border border-border rounded-xl px-6 py-12 flex flex-col items-center gap-3 text-center"
        >
          <span className="text-3xl" aria-hidden="true">
            📊
          </span>
          <p className="text-sm font-semibold text-foreground">
            {allRecords.length === 0
              ? "No evaluations yet"
              : "No results for this filter"}
          </p>
          <p className="text-xs text-muted-foreground max-w-xs">
            {allRecords.length === 0
              ? "Switch to the New Evaluation tab and run an evaluation to see candidates here."
              : "Select a different role or run more evaluations to populate this view."}
          </p>
        </div>
      ) : (
        <>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                      Owner / Repo
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                      Role
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                      Score
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                      Verdict
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                      Date
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((record, i) => (
                    <TableRow key={record.id} record={record} index={i + 1} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: "Avg Score (filtered)",
                value: (
                  sorted.reduce(
                    (acc, r) => acc + Number(r.result.final_score),
                    0,
                  ) / sorted.length
                ).toFixed(1),
                ocid: "reporting.avg_score",
              },
              {
                label: "Top Score",
                value: Number(sorted[0].result.final_score).toFixed(1),
                ocid: "reporting.top_score",
              },
              {
                label: "Showing",
                value: `${sorted.length} / ${allRecords.length}`,
                ocid: "reporting.count",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                data-ocid={stat.ocid}
                className="bg-card border border-border rounded-lg px-4 py-3 flex flex-col gap-0.5"
              >
                <span className="text-xs text-muted-foreground">
                  {stat.label}
                </span>
                <span className="font-mono font-bold text-foreground text-lg leading-tight">
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
