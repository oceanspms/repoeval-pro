import { useMemo, useState } from "react";
import type { EvaluationRecord } from "../types";
import { useHistory } from "./useHistory";

/** Dynamic type — any string role from backend, plus "All" sentinel */
export type ReportingRole = string;

/** Returns the raw project_type for a record, defaulting to "Unknown". */
export function getRoleFromRecord(record: EvaluationRecord): string {
  const pt = record.result?.project_type?.trim();
  return pt && pt.length > 0 ? pt : "Unknown";
}

export function useReporting() {
  const history = useHistory();
  const [selectedRole, setSelectedRole] = useState<ReportingRole>("All");

  const allRecords: EvaluationRecord[] = history.data ?? [];

  /** Derive unique roles from actual data — "All" is always first, then sorted alpha */
  const availableRoles = useMemo<string[]>(() => {
    if (allRecords.length === 0) return ["All"];
    const roles = new Set<string>();
    for (const record of allRecords) {
      roles.add(getRoleFromRecord(record));
    }
    return ["All", ...[...roles].sort((a, b) => a.localeCompare(b))];
  }, [allRecords]);

  /** Synchronous, memoized filter — instant on tab click */
  const filteredRecords = useMemo<EvaluationRecord[]>(() => {
    if (selectedRole === "All") return allRecords;
    return allRecords.filter((r) => getRoleFromRecord(r) === selectedRole);
  }, [allRecords, selectedRole]);

  function setRole(role: ReportingRole) {
    setSelectedRole(role);
  }

  return {
    ...history,
    allRecords,
    filteredRecords,
    availableRoles,
    selectedRole,
    setRole,
  };
}
