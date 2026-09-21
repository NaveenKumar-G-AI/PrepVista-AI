import { RoleSkillImportance, Severity, type SkillGapResult } from "./types.js";
import type { GapEngineConfig } from "./config.js";

const SEVERITY_SCORE: Record<Severity, number> = {
  [Severity.CRITICAL]: 4,
  [Severity.HIGH]: 3,
  [Severity.MEDIUM]: 2,
  [Severity.LOW]: 1,
};

const IMPORTANCE_SCORE: Record<RoleSkillImportance, number> = {
  [RoleSkillImportance.CORE]: 3,
  [RoleSkillImportance.IMPORTANT]: 2,
  [RoleSkillImportance.SUPPORTING]: 1,
  [RoleSkillImportance.OPTIONAL]: 0,
};

/**
 * Implements Phase 11 (Gap Priority). Severity answers "how bad is this";
 * priority answers "which one should be worked on first". They are
 * deliberately different composites so the two can disagree - e.g. two
 * CRITICAL gaps can still be ranked against each other by dependency
 * impact and confidence.
 */
export function calculatePriorityScore(params: {
  severity: Severity;
  importance: RoleSkillImportance;
  gapMagnitude: number;
  dependencyImpactScore: number;
  confidence: number;
  config: GapEngineConfig;
}): number {
  const { severity, importance, gapMagnitude, dependencyImpactScore, confidence, config } = params;
  const w = config.priorityWeights;

  return (
    SEVERITY_SCORE[severity] * w.severity +
    IMPORTANCE_SCORE[importance] * w.importance +
    gapMagnitude * w.magnitude +
    dependencyImpactScore * w.dependency +
    confidence * w.confidence
  );
}

/** Ranks gaps for a role by priority score, highest first, and stamps
 *  `priorityRank` on each result (1-indexed). Pure - returns a new array,
 *  does not mutate the input. */
export function rankGapsForRole(gaps: SkillGapResult[]): SkillGapResult[] {
  const sorted = [...gaps].sort((a, b) => b.priorityScore - a.priorityScore);
  return sorted.map((gap, index) => ({ ...gap, priorityRank: index + 1 }));
}
