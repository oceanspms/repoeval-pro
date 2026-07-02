import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileUp,
  Loader2,
  Paperclip,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import type { UseFileExtraction } from "../hooks/useFileExtraction";
import type { UseNotesExtraction } from "../hooks/useNotesExtraction";
import type { EvaluationFormData } from "../types";

const GITHUB_RE = /^https?:\/\/(www\.)?github\.com\/[^/\s]+\/[^/\s]+/;
const ACCEPTED_ASSIGNMENT_TYPES = ".pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx,.zip,.rar";
// Notes accept everything
const ACCEPTED_NOTES_TYPES = "*";
let idCounter = 0;

function newEntry(url = "") {
  return { id: `repo-${++idCounter}`, url };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface RepoEntry {
  id: string;
  url: string;
}

interface EvalFormProps {
  onSubmit: (data: EvaluationFormData) => void;
  isLoading: boolean;
  backendReady: boolean;
  repoEntries: RepoEntry[];
  setRepoEntries: (v: RepoEntry[]) => void;
  assignment: string;
  setAssignment: (v: string) => void;
  fileExtraction: UseFileExtraction;
  notesExtraction: UseNotesExtraction;
}

export type { RepoEntry };
export { newEntry };

/** Small inline status indicator for file uploads */
function FileStatusPill({
  file,
  status,
  error,
  onClear,
  onRetry,
  loadingLabel = "Processing…",
  ocidPrefix,
}: {
  file: File;
  status: string;
  error: string;
  onClear: () => void;
  onRetry?: () => void;
  loadingLabel?: string;
  ocidPrefix: string;
}) {
  const isSpinning = status === "uploading" || status === "processing";
  const isReady = status === "ready";
  const isError = status === "error";

  return (
    <div className="flex flex-col gap-1">
      <div
        data-ocid={`${ocidPrefix}.card`}
        className={[
          "flex items-center gap-2 px-3 py-2 rounded-md border text-xs",
          isError
            ? "bg-destructive/5 border-destructive/30"
            : isReady
              ? "bg-[oklch(var(--chart-3)/0.05)] border-[oklch(var(--chart-3)/0.3)]"
              : "bg-muted/50 border-border",
        ].join(" ")}
      >
        {isSpinning && (
          <Loader2
            data-ocid={`${ocidPrefix}.loading_state`}
            className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0"
          />
        )}
        {isReady && (
          <CheckCircle2 className="w-3.5 h-3.5 text-[oklch(var(--chart-3))] shrink-0" />
        )}
        {(isError || status === "idle") && (
          <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="text-foreground font-medium truncate min-w-0 flex-1">
          {file.name}
        </span>
        <span className="text-muted-foreground shrink-0">
          {formatBytes(file.size)}
        </span>
        {status === "uploading" && (
          <span className="text-muted-foreground shrink-0">Uploading…</span>
        )}
        {status === "processing" && (
          <span className="text-muted-foreground shrink-0">{loadingLabel}</span>
        )}
        {isReady && (
          <span className="text-[oklch(var(--chart-3))] font-medium shrink-0">
            Ready
          </span>
        )}
        <button
          type="button"
          data-ocid={`${ocidPrefix}.close_button`}
          onClick={onClear}
          aria-label="Remove file"
          className="ml-auto shrink-0 text-muted-foreground hover:text-foreground transition-colors duration-150"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {isError && error && (
        <div className="flex items-center gap-2">
          <p
            data-ocid={`${ocidPrefix}.error_state`}
            className="text-xs text-destructive flex-1"
          >
            {error}
          </p>
          {onRetry && (
            <button
              type="button"
              data-ocid={`${ocidPrefix}.retry_button`}
              onClick={onRetry}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border px-2 py-1 rounded-md transition-colors duration-150 shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function EvalForm({
  onSubmit,
  isLoading,
  backendReady,
  repoEntries,
  setRepoEntries,
  assignment,
  setAssignment,
  fileExtraction,
  notesExtraction,
}: EvalFormProps) {
  const [urlErrors, setUrlErrors] = useState<Record<string, string>>({});
  const [previewOpen, setPreviewOpen] = useState(false);

  const assignmentFileRef = useRef<HTMLInputElement>(null);
  const notesFileRef = useRef<HTMLInputElement>(null);

  const {
    state: fileState,
    handleFileSelect,
    retryExtraction,
    clearFile,
    setExtractedText,
    cleanText,
  } = fileExtraction;

  const {
    notesState,
    handleNotesFileSelect,
    retryNotesFile,
    clearNotesFile,
    setManualText,
    fetchGoogleDoc,
  } = notesExtraction;

  // Effective assignment text: file takes priority when present
  const effectiveAssignment =
    fileState.file && fileState.extractedText
      ? fileState.extractedText
      : assignment;

  const validUrls = repoEntries.filter((e) => GITHUB_RE.test(e.url.trim()));
  // Notes errors do NOT block submission — notes are supplementary.
  // Only block on: no valid repo, empty assignment, active extraction, or
  // assignment file error (since that's the primary content).
  const canSubmit =
    backendReady &&
    validUrls.length > 0 &&
    effectiveAssignment.trim().length > 0 &&
    !isLoading &&
    !fileState.isExtracting &&
    fileState.status !== "error";

  function updateUrl(id: string, value: string) {
    setRepoEntries(
      repoEntries.map((e) => (e.id === id ? { ...e, url: value } : e)),
    );
    setUrlErrors((prev) => ({ ...prev, [id]: "" }));
  }

  function handleUrlBlur(id: string) {
    const entry = repoEntries.find((e) => e.id === id);
    const url = entry?.url.trim() ?? "";
    if (url && !GITHUB_RE.test(url)) {
      setUrlErrors((prev) => ({
        ...prev,
        [id]: "Enter a valid GitHub URL (e.g. https://github.com/user/repo)",
      }));
    }
  }

  function addRepoUrl() {
    setRepoEntries([...repoEntries, newEntry()]);
  }

  function removeRepoUrl(id: string) {
    if (repoEntries.length <= 1) return;
    setRepoEntries(repoEntries.filter((e) => e.id !== id));
    setUrlErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      repoUrls: repoEntries
        .map((e) => e.url.trim())
        .filter((u) => GITHUB_RE.test(u)),
      assignmentDescription: effectiveAssignment.trim(),
      optionalNotes: notesState.combinedText,
    });
  }

  function handleAssignmentFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    void handleFileSelect(file);
    setPreviewOpen(false);
  }

  function handleNotesFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    void handleNotesFileSelect(file);
  }

  function handleClearFile() {
    clearFile();
    setPreviewOpen(false);
  }

  const isGdocUrl = notesState.hasGoogleDocUrl;
  const docFetching = notesState.docFetchStatus === "fetching";
  const docDone = notesState.docFetchStatus === "done";

  return (
    <form
      data-ocid="eval.form"
      onSubmit={handleSubmit}
      className="w-full max-w-2xl bg-card border border-border rounded-lg p-6 flex flex-col gap-5"
    >
      {!backendReady && (
        <div
          data-ocid="eval.backend_status"
          className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        >
          Backend connection is not ready. Check the deployed canister config in
          env.json or use mock backend mode for local UI testing.
        </div>
      )}

      {/* Repo URL(s) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            GitHub Repo Link{repoEntries.length > 1 ? "s" : ""}
          </span>
          <button
            type="button"
            data-ocid="eval.add_repo_button"
            onClick={addRepoUrl}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150"
          >
            <Plus className="w-3 h-3" />
            Add Repo
          </button>
        </div>

        {repoEntries.map((entry, index) => (
          <div key={entry.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <input
                data-ocid={`eval.repo_url.input.${index + 1}`}
                type="url"
                placeholder="https://github.com/username/repo-name"
                value={entry.url}
                onChange={(e) => updateUrl(entry.id, e.target.value)}
                onBlur={() => handleUrlBlur(entry.id)}
                autoComplete="off"
                spellCheck={false}
                aria-label={`GitHub repo URL ${index + 1}`}
                className={[
                  "input-field text-sm flex-1",
                  urlErrors[entry.id]
                    ? "border-destructive focus:ring-destructive"
                    : "",
                ].join(" ")}
              />
              {repoEntries.length > 1 && (
                <button
                  type="button"
                  data-ocid={`eval.remove_repo_button.${index + 1}`}
                  onClick={() => removeRepoUrl(entry.id)}
                  aria-label="Remove repo"
                  className="shrink-0 text-muted-foreground hover:text-destructive transition-colors duration-150"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {urlErrors[entry.id] && (
              <p
                data-ocid={`eval.repo_url.field_error.${index + 1}`}
                className="text-xs text-destructive"
              >
                {urlErrors[entry.id]}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Assignment Description */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor="assignment"
            className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
          >
            Assignment Description
          </label>
          <button
            type="button"
            data-ocid="eval.file_upload.upload_button"
            onClick={() => assignmentFileRef.current?.click()}
            disabled={fileState.isExtracting}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Paperclip className="w-3.5 h-3.5" />
            Upload File
          </button>
          <input
            ref={assignmentFileRef}
            type="file"
            accept={ACCEPTED_ASSIGNMENT_TYPES}
            onChange={handleAssignmentFileChange}
            className="hidden"
            aria-label="Upload assignment file"
          />
        </div>

        {fileState.file && (
          <FileStatusPill
            file={fileState.file}
            status={fileState.status}
            error={fileState.error}
            onClear={handleClearFile}
            onRetry={() => void retryExtraction()}
            ocidPrefix="eval.file_upload"
          />
        )}

        {!(fileState.file && fileState.extractedText) && (
          <textarea
            data-ocid="eval.assignment.textarea"
            id="assignment"
            rows={5}
            placeholder="Paste project requirements or upload a file above"
            value={assignment}
            onChange={(e) => setAssignment(e.target.value)}
            className="input-field text-sm resize-none"
          />
        )}

        {fileState.status === "ready" && fileState.extractedText && (
          <div
            data-ocid="eval.file_upload.preview"
            className="border border-border rounded-md overflow-hidden"
          >
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
              <button
                type="button"
                data-ocid="eval.file_upload.toggle"
                onClick={() => setPreviewOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors duration-150 flex-1 text-left"
              >
                <span>Extracted Text Preview</span>
                {previewOpen ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Clean Text button — shown when backend signals junk OR after auto-clean */}
              {fileState.showCleanButton && (
                <button
                  type="button"
                  data-ocid="eval.file_upload.clean_button"
                  onClick={cleanText}
                  className="flex items-center gap-1 text-xs text-[oklch(var(--chart-4))] hover:text-[oklch(var(--chart-4)/0.8)] border border-[oklch(var(--chart-4)/0.35)] bg-[oklch(var(--chart-4)/0.08)] hover:bg-[oklch(var(--chart-4)/0.15)] px-2 py-0.5 rounded-md transition-colors duration-150 shrink-0 ml-2"
                >
                  <Sparkles className="w-3 h-3" />
                  Clean Text
                </button>
              )}
            </div>

            {/* Auto-clean notification */}
            {fileState.autoCleanNote && (
              <div className="px-3 py-1.5 bg-[oklch(var(--chart-4)/0.08)] border-b border-[oklch(var(--chart-4)/0.25)] flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-[oklch(var(--chart-4))] shrink-0" />
                <p className="text-[11px] text-[oklch(var(--chart-4)/0.9)] font-medium">
                  {fileState.autoCleanNote}
                </p>
              </div>
            )}

            {!previewOpen && (
              <div className="px-3 py-2 bg-muted/10 text-xs text-muted-foreground font-mono leading-relaxed line-clamp-3 select-none">
                {fileState.extractedText.slice(0, 500)}
                {fileState.extractedText.length > 500 && "…"}
              </div>
            )}

            {previewOpen && (
              <textarea
                data-ocid="eval.file_upload.editor"
                rows={8}
                value={fileState.extractedText}
                onChange={(e) => setExtractedText(e.target.value)}
                className="w-full bg-muted/10 px-3 py-2 text-xs font-mono text-foreground resize-y outline-none focus:ring-1 focus:ring-ring border-0"
                spellCheck={false}
              />
            )}
          </div>
        )}
      </div>

      {/* Notes section — file upload + text / Google Docs */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor="notes"
            className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
          >
            Notes{" "}
            <span className="text-muted-foreground/50 normal-case tracking-normal font-normal">
              (optional)
            </span>
          </label>
          <button
            type="button"
            data-ocid="eval.notes_file.upload_button"
            onClick={() => notesFileRef.current?.click()}
            disabled={
              notesState.fileStatus === "processing" ||
              notesState.fileStatus === "uploading"
            }
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileUp className="w-3.5 h-3.5" />
            Attach File
          </button>
          <input
            ref={notesFileRef}
            type="file"
            accept={ACCEPTED_NOTES_TYPES}
            onChange={handleNotesFileChange}
            className="hidden"
            aria-label="Upload notes file"
          />
        </div>

        {/* Notes file pill */}
        {notesState.file && (
          <FileStatusPill
            file={notesState.file}
            status={notesState.fileStatus}
            error={
              notesState.fileStatus === "error"
                ? `${notesState.fileError} (Evaluation will continue without this file.)`
                : notesState.fileError
            }
            onClear={clearNotesFile}
            onRetry={() => void retryNotesFile()}
            loadingLabel="Extracting…"
            ocidPrefix="eval.notes_file"
          />
        )}

        {/* Notes text area: paste text, URLs, or evaluation instructions */}
        <div className="relative">
          <textarea
            data-ocid="eval.notes.textarea"
            id="notes"
            rows={3}
            placeholder="Enter notes, paste URLs (Google Docs, GitHub repo, Notion), or add instructions like: Weight Dockerfile more heavily / Ignore prompt log / Focus on testing"
            value={notesState.manualText}
            onChange={(e) => setManualText(e.target.value)}
            className="input-field text-sm resize-none w-full"
          />
          {/* Google Docs fetch button — appears when a GDoc URL is detected */}
          {isGdocUrl && (
            <button
              type="button"
              data-ocid="eval.notes.fetch_gdoc_button"
              onClick={() => void fetchGoogleDoc()}
              disabled={docFetching || docDone}
              className={[
                "absolute bottom-2 right-2 flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-colors duration-150",
                docDone
                  ? "text-[oklch(var(--chart-3))] border-[oklch(var(--chart-3)/0.3)] bg-[oklch(var(--chart-3)/0.08)] cursor-default"
                  : "text-muted-foreground border-border hover:text-foreground hover:border-accent/40 bg-card",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              {docFetching ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : docDone ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <ExternalLink className="w-3 h-3" />
              )}
              {docFetching ? "Fetching…" : docDone ? "Fetched" : "Fetch Doc"}
            </button>
          )}
        </div>

        {/* Google Docs fetch error — URL still passed through to backend */}
        {notesState.docFetchStatus === "error" && notesState.docFetchError && (
          <p
            data-ocid="eval.notes.fetch_gdoc_error_state"
            className="text-xs text-destructive"
          >
            {notesState.docFetchError} URL will be forwarded to evaluator.
          </p>
        )}

        {/* Summary of what's being included in notes */}
        {notesState.combinedText.trim() && (
          <p className="text-[11px] text-muted-foreground">
            {[
              notesState.fileText && "file content",
              notesState.fetchedDocText && "Google Doc",
              isGdocUrl && !notesState.fetchedDocText && "Google Doc URL",
              !isGdocUrl && notesState.manualText.trim() && "manual notes",
            ]
              .filter(Boolean)
              .join(" + ")}{" "}
            included in evaluation.
          </p>
        )}
      </div>

      <button
        type="submit"
        data-ocid="eval.submit_button"
        disabled={!canSubmit}
        className="btn-primary w-full text-sm mt-1 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isLoading
          ? "Evaluating…"
          : !backendReady
            ? "Backend not ready"
            : fileState.isExtracting
            ? "Extracting…"
            : notesState.fileStatus === "processing"
              ? "Processing notes…"
              : "Evaluate"}
      </button>
    </form>
  );
}
