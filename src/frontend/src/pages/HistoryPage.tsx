import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActor } from "@caffeineai/core-infrastructure";
import { BarChart2, Download, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createActor } from "../backend";
import { ErrorState } from "../components/ErrorState";
import { ResultReport } from "../components/ResultReport";
import { useExportHistory } from "../hooks/useExportHistory";
import { useHistory } from "../hooks/useHistory";
import type { EvaluationRecord } from "../types";

function formatDate(ts: bigint): string {
  const ms = ts / 1_000_000n;
  const d = new Date(Number(ms));
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Color-coded score badge on the backend's 0-100 scale. */
function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 80
      ? "bg-[oklch(var(--chart-2)/0.15)] text-[oklch(var(--chart-2))] border-[oklch(var(--chart-2)/0.3)]"
      : score >= 60
        ? "bg-[oklch(var(--chart-4)/0.15)] text-[oklch(var(--chart-4))] border-[oklch(var(--chart-4)/0.3)]"
        : "bg-[oklch(var(--chart-1)/0.15)] text-[oklch(var(--chart-1))] border-[oklch(var(--chart-1)/0.3)]";

  return (
    <span
      className={[
        "shrink-0 font-mono font-bold text-sm px-2 py-0.5 rounded border",
        cls,
      ].join(" ")}
    >
      {score}/100
    </span>
  );
}

function shortRepo(url: string): string {
  return url
    .replace(/^https?:\/\/(www\.)?github\.com\//, "")
    .replace(/\/$/, "");
}

interface DeleteButtonProps {
  recordId: string;
  onDeleted: () => void;
}

function DeleteButton({ recordId, onDeleted }: DeleteButtonProps) {
  const { actor } = useActor(createActor);
  const [confirm, setConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm) {
      setConfirm(true);
      setTimeout(() => setConfirm(false), 3000);
      return;
    }
    if (!actor) {
      toast.error("Backend not ready — please try again");
      return;
    }
    setIsDeleting(true);
    try {
      await actor.deleteEvaluation(recordId);
      toast.success("Evaluation deleted");
      onDeleted();
    } catch {
      toast.error("Failed to delete evaluation");
    } finally {
      setIsDeleting(false);
      setConfirm(false);
    }
  }

  return (
    <button
      type="button"
      data-ocid={confirm ? "history.confirm_button" : "history.delete_button"}
      title={confirm ? "Click again to confirm deletion" : "Delete evaluation"}
      aria-label={confirm ? "Confirm delete" : "Delete evaluation"}
      disabled={isDeleting}
      onClick={() => void handleDelete()}
      className={[
        "shrink-0 p-1.5 rounded text-xs transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed",
        confirm
          ? "text-destructive bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 px-2 font-medium"
          : "text-muted-foreground hover:text-destructive hover:bg-destructive/8",
      ].join(" ")}
    >
      {isDeleting ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : confirm ? (
        "Confirm?"
      ) : (
        <Trash2 className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

interface HistoryRowProps {
  record: EvaluationRecord;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  onDownload: (record: EvaluationRecord) => void;
  onDeleted: () => void;
  isExportLoading: boolean;
}

function HistoryRow({
  record,
  index,
  isOpen,
  onToggle,
  onDownload,
  onDeleted,
  isExportLoading,
}: HistoryRowProps) {
  const finalScore = Number(record.result.final_score);
  const ownerName =
    record.owner?.trim() ||
    shortRepo(record.repo_url).split("/")[0] ||
    record.repo_url;

  // Inline verdict for expanded row — compact 1-line summary
  const verdict = record.result.recruiter_verdict;
  const verdictEmoji =
    verdict?.emoji ?? (finalScore >= 80 ? "✅" : finalScore >= 60 ? "⚠️" : "❌");
  const verdictText =
    verdict?.verdict ??
    (finalScore >= 80
      ? "Highly Recommended"
      : finalScore >= 60
        ? "Proceed with Caution"
        : "Not Recommended");
  const verdictWhy = verdict?.why ?? "";

  return (
    <div
      data-ocid={`history.item.${index}`}
      className="bg-card border border-border rounded-lg overflow-hidden"
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-ocid={`history.item.${index}.toggle`}
          onClick={onToggle}
          className="flex-1 flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-smooth min-w-0"
        >
          {/* Color-coded score badge */}
          <ScoreBadge score={finalScore} />

          {/* Owner (primary identifier) + repo (secondary) */}
          <span className="flex-1 flex flex-col min-w-0 gap-0.5">
            <span className="text-sm font-semibold text-foreground truncate min-w-0">
              @{ownerName}
            </span>
            <span className="text-xs text-muted-foreground truncate min-w-0 font-mono">
              {shortRepo(record.repo_url)}
            </span>
          </span>

          {/* Date */}
          <span className="shrink-0 text-xs text-muted-foreground font-mono">
            {formatDate(record.timestamp)}
          </span>

          {/* Chevron */}
          <span className="shrink-0 text-muted-foreground text-xs ml-1">
            {isOpen ? "▲" : "▼"}
          </span>
        </button>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 mr-2">
          <button
            type="button"
            data-ocid={`history.item.${index}.download_button`}
            title="Generate Candidate Brief"
            aria-label="Generate Candidate Brief"
            disabled={isExportLoading}
            onClick={() => onDownload(record)}
            className="shrink-0 p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isExportLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
          </button>

          <DeleteButton recordId={record.id} onDeleted={onDeleted} />
        </div>
      </div>

      {/* Expanded: inline verdict summary + full report */}
      {isOpen && (
        <div className="border-t border-border bg-background">
          {/* Compact inline verdict */}
          <div className="px-4 py-3 border-b border-border bg-muted/10 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-base leading-none">{verdictEmoji}</span>
              <span className="text-sm font-semibold text-foreground">
                {verdictText}
              </span>
            </div>
            {verdictWhy && (
              <p className="text-xs text-muted-foreground leading-relaxed pl-6">
                {verdictWhy}
              </p>
            )}
          </div>
          <div className="px-4 py-5">
            <ResultReport result={record.result} />
          </div>
        </div>
      )}
    </div>
  );
}

function HistorySkeletonRow() {
  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-3">
      <Skeleton className="w-12 h-6 rounded" />
      <div className="flex-1 flex flex-col gap-1.5">
        <Skeleton className="w-32 h-4 rounded" />
        <Skeleton className="w-48 h-3 rounded" />
      </div>
      <Skeleton className="w-20 h-3 rounded" />
    </div>
  );
}

export function HistoryPage() {
  const { data: history, isLoading, error, refetch, refresh } = useHistory();
  const [openId, setOpenId] = useState<string | null>(null);
  const {
    downloadFullSummary,
    downloadRoleReport,
    generateCandidateBrief,
    isLoading: isExportLoading,
  } = useExportHistory();

  useEffect(() => {
    void refetch();
  }, [refetch]);

  function handleToggle(id: string) {
    setOpenId((prev) => (prev === id ? null : id));
  }

  function handleDeleted() {
    refresh();
  }

  if (isLoading) {
    return (
      <div
        data-ocid="history.loading_state"
        className="flex flex-col items-center gap-6 w-full"
      >
        <div className="w-full max-w-2xl flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="w-40 h-6 rounded" />
            <Skeleton className="w-64 h-4 rounded" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="w-28 h-8 rounded" />
            <Skeleton className="w-28 h-8 rounded" />
          </div>
        </div>
        <div className="w-full max-w-2xl flex flex-col gap-3">
          <HistorySkeletonRow />
          <HistorySkeletonRow />
          <HistorySkeletonRow />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-ocid="history.error_state"
        className="flex justify-center py-12"
      >
        <ErrorState
          message="Could not load evaluation history. Please try again."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const sorted = history
    ? [...history].sort((a, b) => Number(b.timestamp - a.timestamp))
    : [];

  return (
    <div data-ocid="history.page" className="flex flex-col items-center gap-6">
      {/* Page header + export toolbar */}
      <div className="w-full max-w-2xl">
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <h1 className="font-display text-lg font-semibold text-foreground">
              Evaluation History
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {sorted.length > 0
                ? `${sorted.length} evaluation${sorted.length === 1 ? "" : "s"} — click any row to view the full report.`
                : "Past evaluations appear here after you run them."}
            </p>
          </div>

          {/* Export toolbar */}
          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            <Button
              variant="outline"
              size="sm"
              data-ocid="history.export_all_button"
              disabled={isExportLoading || sorted.length === 0}
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
              data-ocid="history.role_report_button"
              disabled={isExportLoading || sorted.length === 0}
              onClick={() => void downloadRoleReport()}
              className="flex items-center gap-1.5 text-xs h-8 px-3"
            >
              {isExportLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <BarChart2 className="w-3.5 h-3.5" />
              )}
              Role Report
            </Button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="w-full max-w-2xl flex flex-col gap-3">
        {sorted.length === 0 ? (
          <div
            data-ocid="history.empty_state"
            className="bg-card border border-border rounded-lg px-6 py-12 flex flex-col items-center gap-3 text-center"
          >
            <span className="text-3xl" aria-hidden="true">
              📋
            </span>
            <p className="text-sm font-semibold text-foreground">
              No evaluations yet
            </p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Run an evaluation from the New Evaluation tab and it will appear
              here automatically.
            </p>
          </div>
        ) : (
          sorted.map((record, i) => (
            <HistoryRow
              key={record.id}
              record={record}
              index={i + 1}
              isOpen={openId === record.id}
              onToggle={() => handleToggle(record.id)}
              onDownload={generateCandidateBrief}
              onDeleted={handleDeleted}
              isExportLoading={isExportLoading}
            />
          ))
        )}
      </div>
    </div>
  );
}
