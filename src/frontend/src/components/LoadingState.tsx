import { useEffect, useState } from "react";

const STEPS = [
  { label: "Fetching repo…", duration: 1200 },
  { label: "Parsing assignment…", duration: 1000 },
  { label: "Scoring…", duration: 800 },
];

export function LoadingState() {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (stepIndex >= STEPS.length - 1) return;
    const t = setTimeout(
      () => setStepIndex((i) => i + 1),
      STEPS[stepIndex].duration,
    );
    return () => clearTimeout(t);
  }, [stepIndex]);

  return (
    <div
      data-ocid="eval.loading_state"
      className="w-full max-w-2xl mx-auto bg-card border border-border rounded-lg p-8 flex flex-col items-center gap-6"
    >
      {/* Spinner */}
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-border" />
        <div className="absolute inset-0 rounded-full border-2 border-t-accent animate-spin" />
      </div>

      {/* Steps */}
      <div className="flex flex-col items-center gap-2 w-full max-w-xs">
        {STEPS.map((step, i) => (
          <div
            key={step.label}
            className={[
              "flex items-center gap-2.5 text-sm font-mono transition-smooth",
              i === stepIndex
                ? "text-accent"
                : i < stepIndex
                  ? "text-muted-foreground line-through"
                  : "text-muted-foreground/40",
            ].join(" ")}
          >
            <span
              className={[
                "w-1.5 h-1.5 rounded-full flex-shrink-0",
                i === stepIndex
                  ? "bg-accent"
                  : i < stepIndex
                    ? "bg-muted-foreground"
                    : "bg-muted-foreground/30",
              ].join(" ")}
            />
            {step.label}
          </div>
        ))}
      </div>
    </div>
  );
}
