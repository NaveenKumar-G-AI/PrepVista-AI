// Centralized, configurable scoring rules. Nothing in the engine hard-codes
// weights or thresholds outside this file — tune the product here, not by
// hunting through comparator logic.

import type { AlignmentStatus, ConsistencyDimension, ConsistencyState } from "../types";

export const DIMENSION_WEIGHTS: Record<ConsistencyDimension, number> = {
  PROBLEM_ALIGNMENT: 0.08,
  ALGORITHM_ALIGNMENT: 0.16,
  DATA_STRUCTURE_ALIGNMENT: 0.08,
  STATE_ALIGNMENT: 0.1,
  CONTROL_FLOW_ALIGNMENT: 0.07,
  CORRECTNESS_ALIGNMENT: 0.13,
  COMPLEXITY_ALIGNMENT: 0.1,
  SPACE_ALIGNMENT: 0.06,
  EDGE_CASE_ALIGNMENT: 0.08,
  BEHAVIOUR_ALIGNMENT: 0.06,
  IMPLEMENTATION_DECISION_ALIGNMENT: 0.04,
  OPTIMIZATION_ALIGNMENT: 0.04,
};
// Weights must sum to 1 — enforced in tests/scoring.test.ts.

export const ALIGNMENT_BASE_SCORE: Record<Exclude<AlignmentStatus, "UNKNOWN">, number> = {
  MATCH: 100,
  PARTIAL: 60,
  MISMATCH: 15,
};

export const STATE_THRESHOLDS: { min: number; state: ConsistencyState }[] = [
  { min: 90, state: "HIGHLY_CONSISTENT" },
  { min: 75, state: "MOSTLY_CONSISTENT" },
  { min: 55, state: "PARTIALLY_CONSISTENT" },
  { min: 0, state: "SIGNIFICANTLY_INCONSISTENT" },
];

// Fraction of the 12 dimensions that must have resolvable evidence (score !== null)
// before the engine will report a confident overall state at all. Below this,
// overall state is INSUFFICIENT_EVIDENCE rather than a number nobody should trust.
export const MIN_EVIDENCE_COVERAGE_FOR_SCORING = 0.5;

export const ENGINE_VERSION = "0.1.0";
export const RULES_VERSION = "2026-08-18";
