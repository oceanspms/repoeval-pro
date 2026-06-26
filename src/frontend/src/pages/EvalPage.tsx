import { useCallback, useState } from "react";
import { ErrorState } from "../components/ErrorState";
import { EvalForm, type RepoEntry, newEntry } from "../components/EvalForm";
import { LoadingState } from "../components/LoadingState";
import { ResultReport } from "../components/ResultReport";
import { useEvaluation } from "../hooks/useEvaluation";
import { useFileExtraction } from "../hooks/useFileExtraction";
import { useNotesExtraction } from "../hooks/useNotesExtraction";
import type { EvaluationFormData, EvaluationResult } from "../types";

interface EvalPageProps {
  onNewEvaluation?: () => void;
}

/** Shorten a GitHub URL to "owner/repo" for tab labels */
function shortRepo(url: string): string {
  return url
    .replace(/^https?:\/\/(www\.)?github\.com\//, "")
    .replace(/\/$/, "");
}

interface MultiRepoTabsProps {
  results: EvaluationResult[];
  repoUrls: string[];
}

function MultiRepoTabs({ results, repoUrls }: MultiRepoTabsProps) {
  const [activeIdx, setActiveIdx] = useState(0);

  if (results.length === 1) {
    return <ResultReport result={results[0]} />;
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-0">
      <div className="flex gap-0 border border-border rounded-t-lg overflow-hidden bg-muted/30">
        {results.map((_, i) => (
          <button
            type="button"
            key={repoUrls[i] ?? `repo-tab-${i}`}
            data-ocid={`result.repo_tab.${i + 1}`}
            onClick={() => setActiveIdx(i)}
            className={[
              "flex-1 px-3 py-2 text-xs font-mono font-medium transition-colors duration-150 truncate",
              activeIdx === i
                ? "bg-card text-foreground border-b-2 border-accent"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            ].join(" ")}
          >
            {shortRepo(repoUrls[i] ?? "")}
          </button>
        ))}
      </div>
      <div className="border border-t-0 border-border rounded-b-lg bg-background px-0 py-4">
        <ResultReport result={results[activeIdx]} />
      </div>
    </div>
  );
}

export function EvalPage({ onNewEvaluation }: EvalPageProps) {
  const { data, loading, error, evaluate, reset } = useEvaluation();
  const fileExtraction = useFileExtraction();
  const notesExtraction = useNotesExtraction();

  const [repoEntries, setRepoEntries] = useState<RepoEntry[]>([newEntry()]);
  const [assignment, setAssignment] = useState("");
  const [evaluatedUrls, setEvaluatedUrls] = useState<string[]>([]);
  const [lastSubmittedForm, setLastSubmittedForm] =
    useState<EvaluationFormData | null>(null);
  const [hasCompletedEval, setHasCompletedEval] = useState(false);

  const scrollToResults = useCallback(() => {
    setTimeout(() => {
      document
        .getElementById("eval-results")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }, []);

  const handleSubmit = useCallback(
    async (form: EvaluationFormData) => {
      setLastSubmittedForm(form);
      setEvaluatedUrls(form.repoUrls);
      await evaluate(form);
      setHasCompletedEval(true);
      scrollToResults();
    },
    [evaluate, scrollToResults],
  );

  const handleRetry = useCallback(async () => {
    if (!lastSubmittedForm) {
      reset();
      return;
    }
    setEvaluatedUrls(lastSubmittedForm.repoUrls);
    await evaluate(lastSubmittedForm);
    scrollToResults();
  }, [evaluate, lastSubmittedForm, reset, scrollToResults]);

  // "New Evaluation" → App bumps the key which unmounts + remounts this entire component
  // so all state resets automatically. We just call onNewEvaluation.
  const handleNewEvaluation = useCallback(() => {
    onNewEvaluation?.();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [onNewEvaluation]);

  const showNewEvalBtn = hasCompletedEval || (data !== null && !loading);

  return (
    <div data-ocid="eval.page" className="flex flex-col items-center gap-6">
      {/* Page header */}
      <div className="w-full max-w-2xl flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-semibold text-foreground mb-1">
            Repository Evaluation
          </h1>
          <p className="text-sm text-muted-foreground">
            Deterministic assignment-to-submission scoring for hiring decisions.
          </p>
        </div>
        {showNewEvalBtn && (
          <button
            type="button"
            data-ocid="eval.new_evaluation_button"
            onClick={handleNewEvaluation}
            className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border hover:border-accent/40 px-3 py-1.5 rounded-md transition-smooth"
          >
            + New Evaluation
          </button>
        )}
      </div>

      {/* Form */}
      <EvalForm
        onSubmit={handleSubmit}
        isLoading={loading}
        repoEntries={repoEntries}
        setRepoEntries={setRepoEntries}
        assignment={assignment}
        setAssignment={setAssignment}
        fileExtraction={fileExtraction}
        notesExtraction={notesExtraction}
      />

      {/* Results area */}
      <div
        id="eval-results"
        className="w-full flex flex-col items-center gap-4"
      >
        {loading && <LoadingState />}
        {error && !loading && (
          <ErrorState message={error} onRetry={handleRetry} />
        )}
        {data && !loading && !error && (
          <MultiRepoTabs results={data} repoUrls={evaluatedUrls} />
        )}
      </div>
    </div>
  );
}
