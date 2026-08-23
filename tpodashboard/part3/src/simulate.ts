import type { RuleNode, Student } from "./types.js";
import { summarizeCohort } from "./summarize.js";

export interface SimulationResult {
  baselineEligibleCount: number;
  candidateEligibleCount: number;
  delta: number;
  newlyEligibleStudentIds: string[];
  removedStudentIds: string[];
}

/**
 * Pure function: never mutates `students`, `baselineRule`, or
 * `candidateRule`. Simulating a rule change therefore cannot affect the
 * real drive by construction - there is no write path in this module at
 * all, so "apply simulation to draft" has to be a separate, explicit step
 * elsewhere rather than something this function could ever do by accident.
 */
export function simulateEligibility(
  students: Student[],
  baselineRule: RuleNode,
  candidateRule: RuleNode,
  versions: { baseline: number; candidate: number }
): SimulationResult {
  const baseline = summarizeCohort(students, baselineRule, versions.baseline);
  const candidate = summarizeCohort(students, candidateRule, versions.candidate);

  const baselineEligibleIds = new Set(baseline.results.filter((r) => r.eligible).map((r) => r.studentId));
  const candidateEligibleIds = new Set(candidate.results.filter((r) => r.eligible).map((r) => r.studentId));

  const newlyEligibleStudentIds = [...candidateEligibleIds].filter((id) => !baselineEligibleIds.has(id));
  const removedStudentIds = [...baselineEligibleIds].filter((id) => !candidateEligibleIds.has(id));

  return {
    baselineEligibleCount: baseline.eligibleCount,
    candidateEligibleCount: candidate.eligibleCount,
    delta: candidate.eligibleCount - baseline.eligibleCount,
    newlyEligibleStudentIds,
    removedStudentIds,
  };
}
