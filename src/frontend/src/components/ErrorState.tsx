import { AlertTriangle } from "lucide-react";

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      data-ocid="eval.error_state"
      className="w-full max-w-2xl mx-auto bg-card border border-destructive/30 rounded-lg p-6 flex flex-col items-center gap-4 text-center"
    >
      <AlertTriangle className="w-8 h-8 text-destructive" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">Evaluation failed</p>
        <p className="text-xs text-muted-foreground max-w-sm">{message}</p>
      </div>
      <button
        type="button"
        data-ocid="eval.retry_button"
        onClick={onRetry}
        className="btn-primary text-sm px-6"
      >
        Try Again
      </button>
    </div>
  );
}
