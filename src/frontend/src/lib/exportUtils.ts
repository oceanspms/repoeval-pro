import type { EvaluationRecord, RoleStats } from "../types";

/** Normalise a GitHub repo URL for consistent comparison and export. */
export function normalizeRepoUrl(url: string): string {
  return url
    .trim()
    .replace(/\/$/, "") // strip trailing slash
    .replace(/^http:\/\//i, "https://") // normalise to https
    .toLowerCase();
}

/** Wrap a CSV field value in quotes if it contains commas, newlines, or quotes. */
function escapeField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(fields: string[]): string {
  return fields.map(escapeField).join(",");
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function triggerDownload(
  content: string,
  filename: string,
  mimeType = "text/csv;charset=utf-8;",
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const FULL_HEADERS = [
  "owner",
  "repo_url",
  "date",
  "final_score",
  "project_type",
  "alignment",
  "coverage",
  "stackMatch",
  "completeness",
  "depth",
  "docs",
  "demoReadiness",
  "aiUsage",
  "summary_line1",
  "summary_line2",
  "summary_line3",
  "missing_items",
  "red_flags",
];

function recordToRow(record: EvaluationRecord): string {
  const ms =
    Number(record.timestamp) > 1e12
      ? Number(record.timestamp) / 1_000_000
      : Number(record.timestamp) * 1000;
  const date = new Date(ms).toISOString().slice(0, 10);
  const r = record.result;

  const ownerName =
    record.owner?.trim() ||
    record.repo_url
      .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
      .split("/")[0] ||
    "";

  const lines = r.summary
    ? r.summary
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    : [];

  return csvRow([
    ownerName,
    record.repo_url,
    date,
    String(Number(r.final_score)),
    r.project_type,
    String(r.alignment),
    String(Number(r.scores.coverage)),
    String(Number(r.scores.stackMatch)),
    String(Number(r.scores.completeness)),
    String(Number(r.scores.depth)),
    String(Number(r.scores.docs)),
    String(Number(r.scores.demoReadiness)),
    String(Number(r.scores.aiUsage)),
    lines[0] ?? "",
    lines[1] ?? "",
    lines[2] ?? "",
    r.missing_items.join("; "),
    r.red_flags.join("; "),
  ]);
}

export function exportFullSummary(records: EvaluationRecord[]): void {
  const lines = [csvRow(FULL_HEADERS), ...records.map(recordToRow)];
  triggerDownload(lines.join("\n"), `repoeval-full-export-${todayStr()}.csv`);
}

export function exportCandidateReport(
  repoUrl: string,
  records: EvaluationRecord[],
): void {
  const normalizedTarget = normalizeRepoUrl(repoUrl);
  const filtered =
    records.length > 0
      ? records.filter((r) => normalizeRepoUrl(r.repo_url) === normalizedTarget)
      : records;

  const toExport = filtered.length > 0 ? filtered : records;

  const lines = [csvRow(FULL_HEADERS), ...toExport.map(recordToRow)];

  const sanitized = repoUrl
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60);

  triggerDownload(
    lines.join("\n"),
    `repoeval-candidate-${sanitized}-${todayStr()}.csv`,
  );
}

const ROLE_HEADERS = [
  "role",
  "count",
  "avg_score",
  "min_score",
  "max_score",
  "avg_coverage",
  "avg_stack_match",
  "avg_completeness",
  "avg_depth",
  "avg_docs",
  "avg_demo",
  "avg_ai_usage",
];

function decodeScore(v: bigint): string {
  const n = Number(v);
  return (n / 10).toFixed(1);
}

/**
 * Export a role report CSV.
 * - roleStats: raw stats from backend
 * - selectedRole: current tab ("All" or a specific role). If not "All", only that role is exported.
 * - activeRoles: roles that actually exist in history (used to filter out roles with no data).
 *   Pass an empty array to skip filtering (export everything returned by backend).
 */
export function exportRoleReport(
  roleStats: RoleStats[],
  selectedRole = "All",
  activeRoles: string[] = [],
): void {
  // Determine which stats to include
  let filtered = roleStats;

  if (activeRoles.length > 0) {
    // Only include roles that are present in actual evaluation history
    const activeSet = new Set(activeRoles.map((r) => r.toLowerCase()));
    filtered = filtered.filter((s) => activeSet.has(s.role.toLowerCase()));
  }

  if (selectedRole !== "All") {
    // Further narrow to the selected role tab
    filtered = filtered.filter(
      (s) => s.role.toLowerCase() === selectedRole.toLowerCase(),
    );
  }

  const filename =
    selectedRole === "All"
      ? `repoeval-role-report-${todayStr()}.csv`
      : `repoeval-${selectedRole.toLowerCase().replace(/\s+/g, "-")}-report-${todayStr()}.csv`;

  const lines = [
    csvRow(ROLE_HEADERS),
    ...filtered.map((s) =>
      csvRow([
        s.role,
        String(Number(s.count)),
        decodeScore(s.avg_score),
        decodeScore(s.min_score),
        decodeScore(s.max_score),
        decodeScore(s.avg_coverage),
        decodeScore(s.avg_stack_match),
        decodeScore(s.avg_completeness),
        decodeScore(s.avg_depth),
        decodeScore(s.avg_docs),
        decodeScore(s.avg_demo),
        decodeScore(s.avg_ai_usage),
      ]),
    ),
  ];
  triggerDownload(lines.join("\n"), filename);
}

/** Generate and download a printable HTML Candidate Brief for an interviewer */
export function generateCandidateBrief(record: EvaluationRecord): void {
  const r = record.result;
  const finalScore = Number(r.final_score);

  const ownerName =
    record.owner?.trim() ||
    record.repo_url
      .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
      .split("/")[0] ||
    "Unknown Candidate";

  const ms =
    Number(record.timestamp) > 1e12
      ? Number(record.timestamp) / 1_000_000
      : Number(record.timestamp) * 1000;
  const dateStr = new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Determine verdict
  const verdict = r.recruiter_verdict ?? {
    emoji: finalScore > 8.5 ? "✅" : finalScore >= 6 ? "⚠️" : "❌",
    verdict:
      finalScore > 8.5
        ? ("pass" as import("../types").Variant_fail_pass_caution)
        : finalScore >= 6
          ? ("caution" as import("../types").Variant_fail_pass_caution)
          : ("fail" as import("../types").Variant_fail_pass_caution),
    why:
      finalScore > 8.5
        ? "Strong alignment with requirements and solid technical execution across all evaluated dimensions."
        : finalScore >= 6
          ? "Partial alignment — key areas are covered but notable gaps remain."
          : "Does not adequately meet the assignment requirements.",
    technical_debt: finalScore > 8.5 ? "Production Ready" : "Prototype Grade",
    strengths: [],
    criticalGaps: [],
  };

  // Score color
  const scoreColor =
    finalScore >= 8.5 ? "#166534" : finalScore >= 6 ? "#854d0e" : "#991b1b";
  const scoreBg =
    finalScore >= 8.5 ? "#dcfce7" : finalScore >= 6 ? "#fef9c3" : "#fee2e2";

  // Verdict color
  const verdictColor =
    verdict.emoji === "✅"
      ? "#166534"
      : verdict.emoji === "⚠️"
        ? "#854d0e"
        : "#991b1b";
  const verdictBg =
    verdict.emoji === "✅"
      ? "#f0fdf4"
      : verdict.emoji === "⚠️"
        ? "#fefce8"
        : "#fef2f2";
  const verdictBorder =
    verdict.emoji === "✅"
      ? "#bbf7d0"
      : verdict.emoji === "⚠️"
        ? "#fef08a"
        : "#fecaca";

  const dimensions = [
    { label: "Coverage", value: Number(r.scores.coverage) },
    { label: "Stack Match", value: Number(r.scores.stackMatch) },
    { label: "Completeness", value: Number(r.scores.completeness) },
    { label: "Depth", value: Number(r.scores.depth) },
    { label: "Documentation", value: Number(r.scores.docs) },
    { label: "Demo", value: Number(r.scores.demoReadiness) },
    { label: "AI Usage", value: Number(r.scores.aiUsage) },
  ];

  const sorted = [...dimensions].sort((a, b) => b.value - a.value);
  const strengths = sorted.slice(0, 3);
  const weaknesses = sorted.slice(-3).reverse();
  const missingItems = r.missing_items.slice(0, 8);

  const dimRows = dimensions
    .map(
      (d) => `
    <tr>
      <td style="padding:6px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">${d.label}</td>
      <td style="padding:6px 12px;font-size:13px;font-weight:600;text-align:right;color:${d.value >= 7 ? "#166534" : d.value >= 4 ? "#854d0e" : "#991b1b"};border-bottom:1px solid #f3f4f6;">${d.value}/10</td>
    </tr>`,
    )
    .join("");

  const strengthItems = strengths
    .map(
      (s) =>
        `<li style="margin-bottom:4px;font-size:13px;color:#374151;">✓ <strong>${s.label}</strong> — ${s.value}/10</li>`,
    )
    .join("");

  const weaknessItems = weaknesses
    .map(
      (w) =>
        `<li style="margin-bottom:4px;font-size:13px;color:#374151;">✗ <strong>${w.label}</strong> — ${w.value}/10</li>`,
    )
    .join("");

  const missingList =
    missingItems.length > 0
      ? `<ul style="margin:0;padding-left:16px;">${missingItems.map((m) => `<li style="font-size:13px;color:#374151;margin-bottom:3px;">${m}</li>`).join("")}</ul>`
      : `<p style="font-size:13px;color:#6b7280;font-style:italic;margin:0;">No missing items — all requirements covered.</p>`;

  const debtPillBg =
    verdict.technical_debt === "Production Ready" ? "#dcfce7" : "#f3f4f6";
  const debtPillColor =
    verdict.technical_debt === "Production Ready" ? "#166534" : "#374151";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Candidate Brief — @${ownerName}</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; margin: 0; padding: 24px; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; max-width: 680px; margin: 0 auto; overflow: hidden; }
  </style>
</head>
<body>
  <div class="card">
    <!-- Header -->
    <div style="background:#1e293b;padding:24px 28px;display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <p style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 4px;">Candidate Brief</p>
        <h1 style="color:#f1f5f9;font-size:22px;font-weight:700;margin:0 0 6px;">@${ownerName}</h1>
        <span style="display:inline-block;background:#334155;color:#cbd5e1;font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;border:1px solid #475569;">${r.project_type}</span>
      </div>
      <div style="text-align:right;">
        <p style="color:#64748b;font-size:11px;margin:0 0 4px;">${dateStr}</p>
        <a href="${record.repo_url}" style="color:#60a5fa;font-size:11px;text-decoration:none;">${record.repo_url.replace(/^https?:\/\//, "")}</a>
      </div>
    </div>

    <div style="padding:24px 28px;display:flex;flex-direction:column;gap:20px;">
      <!-- Final Score -->
      <div style="display:flex;align-items:center;justify-content:space-between;background:${scoreBg};border:1px solid ${scoreColor}33;border-radius:8px;padding:16px 20px;">
        <div>
          <p style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 2px;">Final Score</p>
          <p style="color:#9ca3af;font-size:12px;margin:0;">Average of 7 dimensions</p>
        </div>
        <span style="font-size:40px;font-weight:800;color:${scoreColor};font-variant-numeric:tabular-nums;">${finalScore}<span style="font-size:20px;color:#9ca3af;font-weight:400;">/10</span></span>
      </div>

      <!-- Verdict -->
      <div style="background:${verdictBg};border:1px solid ${verdictBorder};border-radius:8px;padding:16px 20px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="font-size:24px;">${verdict.emoji}</span>
          <span style="font-size:16px;font-weight:700;color:${verdictColor};">${verdict.verdict}</span>
          <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;background:${debtPillBg};color:${debtPillColor};border:1px solid ${debtPillColor}33;">${verdict.technical_debt}</span>
        </div>
        <p style="color:#374151;font-size:13px;line-height:1.6;margin:0;">${verdict.why}</p>
      </div>

      <!-- Score Dimensions -->
      <div>
        <p style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 10px;">Score Breakdown</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px 12px;font-size:11px;font-weight:600;text-align:left;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Dimension</th>
              <th style="padding:8px 12px;font-size:11px;font-weight:600;text-align:right;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Score</th>
            </tr>
          </thead>
          <tbody>${dimRows}</tbody>
        </table>
      </div>

      <!-- Strengths + Weaknesses -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;">
          <p style="color:#166534;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px;">Top Strengths</p>
          <ul style="margin:0;padding-left:0;list-style:none;">${strengthItems}</ul>
        </div>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;">
          <p style="color:#991b1b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px;">Areas for Improvement</p>
          <ul style="margin:0;padding-left:0;list-style:none;">${weaknessItems}</ul>
        </div>
      </div>

      <!-- Missing Items -->
      <div>
        <p style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px;">Missing Items</p>
        ${missingList}
      </div>

      <!-- Footer -->
      <div style="border-top:1px solid #e5e7eb;padding-top:14px;display:flex;align-items:center;justify-content:space-between;">
        <span style="color:#9ca3af;font-size:11px;">Generated by <strong>RepoEval Pro</strong></span>
        <button class="no-print" onclick="window.print()" style="background:#1e293b;color:#f1f5f9;border:none;padding:7px 16px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Print Brief</button>
      </div>
    </div>
  </div>
</body>
</html>`;

  const sanitized = record.repo_url
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60);

  triggerDownload(
    html,
    `candidate-brief-${sanitized}-${todayStr()}.html`,
    "text/html;charset=utf-8;",
  );
}
