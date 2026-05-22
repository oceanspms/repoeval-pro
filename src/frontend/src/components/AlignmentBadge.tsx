import { Alignment } from "../backend";

interface AlignmentBadgeProps {
  alignment: Alignment;
}

const CONFIG: Record<Alignment, { label: string; classes: string }> = {
  [Alignment.High]: {
    label: "High",
    classes:
      "bg-[oklch(var(--chart-3)/0.1)] text-[oklch(var(--chart-3))] border border-[oklch(var(--chart-3)/0.3)]",
  },
  [Alignment.Medium]: {
    label: "Medium",
    classes:
      "bg-[oklch(var(--chart-4)/0.1)] text-[oklch(var(--chart-4))] border border-[oklch(var(--chart-4)/0.3)]",
  },
  [Alignment.Low]: {
    label: "Low",
    classes: "bg-destructive/10 text-destructive border border-destructive/30",
  },
};

export function AlignmentBadge({ alignment }: AlignmentBadgeProps) {
  const cfg = CONFIG[alignment];
  return (
    <span
      data-ocid="result.alignment_badge"
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold uppercase tracking-wider ${cfg.classes}`}
    >
      {cfg.label}
    </span>
  );
}
