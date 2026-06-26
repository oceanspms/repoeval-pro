import { useState } from "react";
import { toast } from "sonner";
import {
  exportFullSummary,
  exportRoleReport,
  generateCandidateBrief,
  normalizeRepoUrl,
} from "../lib/exportUtils";
import type { EvaluationRecord } from "../types";
import { useBackendActor } from "./useBackendActor";

function normalizeRecord(r: {
  id: string;
  repo_url: string;
  assignment_text: string;
  result: EvaluationRecord["result"];
  timestamp: bigint;
  owner?: string;
}): EvaluationRecord {
  return { ...r, owner: r.owner ?? "" };
}

export function useExportHistory() {
  const { actor, isFetching } = useBackendActor();
  const [isLoading, setIsLoading] = useState(false);

  async function downloadFullSummary(): Promise<void> {
    if (!actor || isFetching) return;
    setIsLoading(true);
    try {
      const raw = await actor.getExportHistory();
      exportFullSummary(raw.map(normalizeRecord));
      toast.success("Downloaded: repoeval-full-export.csv");
    } catch {
      toast.error("Export failed");
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * Download a role report filtered to only active roles (those present in data).
   * - selectedRole: current tab selection ("All" or a specific role name)
   * - activeRoles: the derived availableRoles list from useReporting (excludes "All")
   */
  async function downloadRoleReport(
    selectedRole = "All",
    activeRoles: string[] = [],
  ): Promise<void> {
    if (!actor || isFetching) return;
    setIsLoading(true);
    try {
      const stats = await actor.getRoleStats();
      // Determine which roles to include in the export
      const rolesInData = activeRoles.filter((r) => r !== "All");
      exportRoleReport(stats, selectedRole, rolesInData);
      const label =
        selectedRole === "All"
          ? "repoeval-role-report.csv"
          : `repoeval-${selectedRole.toLowerCase()}-report.csv`;
      toast.success(`Downloaded: ${label}`);
    } catch {
      toast.error("Export failed");
    } finally {
      setIsLoading(false);
    }
  }

  async function downloadCandidateReport(repoUrl: string): Promise<void> {
    if (!actor || isFetching) return;
    setIsLoading(true);
    try {
      const normalized = normalizeRepoUrl(repoUrl);
      let raw = await actor.getHistoryByRepo(normalized);
      if (raw.length === 0) {
        const all = await actor.getExportHistory();
        raw = all.filter((r) => normalizeRepoUrl(r.repo_url) === normalized);
      }
      const records = raw.map(normalizeRecord);
      if (records.length > 0) {
        generateCandidateBrief(records[0]);
        toast.success("Candidate Brief downloaded");
      } else {
        toast.error("No matching record found");
      }
    } catch {
      toast.error("Export failed");
    } finally {
      setIsLoading(false);
    }
  }

  function handleGenerateCandidateBrief(record: EvaluationRecord): void {
    try {
      generateCandidateBrief(record);
      toast.success("Candidate Brief downloaded");
    } catch {
      toast.error("Could not generate Candidate Brief");
    }
  }

  return {
    downloadFullSummary,
    downloadRoleReport,
    downloadCandidateReport,
    generateCandidateBrief: handleGenerateCandidateBrief,
    isLoading,
  };
}
