import type { RuleNode, Student, FailureCategory, EligibilityResult } from "./types.js";
import { evaluateStudent } from "./evaluate.js";

export interface CohortSummary {
  total: number;
  eligibleCount: number;
  notEligibleCount: number;
  byPrimaryFailureCategory: Record<FailureCategory, number>;
  results: EligibilityResult[];
}

export function summarizeCohort(students: Student[], rule: RuleNode, ruleVersion: number): CohortSummary {
  const results = students.map((s) => evaluateStudent(s, rule, ruleVersion));
  const byPrimaryFailureCategory: Record<FailureCategory, number> = {
    CGPA: 0,
    BACKLOG: 0,
    DEPARTMENT: 0,
    OTHER: 0,
  };
  let eligibleCount = 0;
  for (const r of results) {
    if (r.eligible) {
      eligibleCount++;
    } else if (r.primaryFailureCategory) {
      byPrimaryFailureCategory[r.primaryFailureCategory]++;
    }
  }
  return {
    total: students.length,
    eligibleCount,
    notEligibleCount: students.length - eligibleCount,
    byPrimaryFailureCategory,
    results,
  };
}
