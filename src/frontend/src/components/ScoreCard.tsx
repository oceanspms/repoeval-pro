interface ScoreCardProps {
  label: string;
  score: number;
  isFinal?: boolean;
  "data-ocid"?: string;
}

// pass ≥7 → chart-3 (green), warn 4-6 → chart-4 (amber), fail <4 → destructive (red)
function scoreColor(score: number): string {
  if (score >= 7) return "text-[oklch(var(--chart-3))]";
  if (score >= 4) return "text-[oklch(var(--chart-4))]";
  return "text-destructive";
}

function scoreBorder(score: number): string {
  if (score >= 7) return "border-[oklch(var(--chart-3)/0.3)]";
  if (score >= 4) return "border-[oklch(var(--chart-4)/0.3)]";
  return "border-destructive/30";
}

function scoreBg(score: number): string {
  if (score >= 7) return "bg-[oklch(var(--chart-3)/0.05)]";
  if (score >= 4) return "bg-[oklch(var(--chart-4)/0.05)]";
  return "bg-destructive/5";
}

export function ScoreCard({
  label,
  score,
  isFinal = false,
  "data-ocid": ocid,
}: ScoreCardProps) {
  return (
    <div
      data-ocid={ocid}
      className={[
        "flex flex-col items-center justify-center rounded-md border px-3 py-2.5 min-w-[80px] transition-smooth",
        scoreBg(score),
        scoreBorder(score),
        isFinal ? "ring-1 ring-accent/40 bg-accent/5 border-accent/30" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={[
          "font-mono font-bold leading-none",
          isFinal ? "text-2xl text-accent" : "text-xl",
          isFinal ? "" : scoreColor(score),
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {score}
        <span className="text-muted-foreground font-normal text-sm">/10</span>
      </span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5 text-center leading-tight">
        {label}
      </span>
    </div>
  );
}
