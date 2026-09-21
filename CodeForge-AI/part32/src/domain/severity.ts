import { GapStatus, RoleSkillImportance, Severity } from "./types.js";
import type { GapEngineConfig } from "./config.js";

const IMPORTANCE_SCORE: Record<RoleSkillImportance, number> = {
  [RoleSkillImportance.CORE]: 3,
  [RoleSkillImportance.IMPORTANT]: 2,
  [RoleSkillImportance.SUPPORTING]: 1,
  [RoleSkillImportance.OPTIONAL]: 0,
};

/**
 * Implements Phase 10 (Gap Severity), Phase 12 (core skills must not be
 * hidden by averages) and Phase 13 (optional skills must not be treated as
 * blockers).
 *
 * Severity is a function of role context - not the raw mastery score.
 * A CORE skill with a large gap is CRITICAL regardless of how many other
 * skills the student is strong in; an OPTIONAL skill with the same
 * numeric gap and no dependency impact tops out at LOW/MEDIUM.
 *
 * Unassessed/insufficient-evidence skills are NOT treated as failing, but
 * they are also not ignored when they sit on a CORE or IMPORTANT skill -
 * "we don't know if this critical skill is there" is itself a real risk
 * to role readiness, so it still earns a meaningful (though capped) score.
 */
export function calculateSeverity(params: {
  gapStatus: GapStatus;
  gapMagnitude: number;
  importance: RoleSkillImportance;
  isRootGap: boolean;
  dependencyImpactScore: number;
  config: GapEngineConfig;
}): Severity {
  const { gapStatus, gapMagnitude, importance, isRootGap, dependencyImpactScore } = params;

  if (gapStatus === GapStatus.NO_GAP) return Severity.LOW;

  let score = IMPORTANCE_SCORE[importance];

  switch (gapStatus) {
    case GapStatus.BELOW_TARGET:
    case GapStatus.DEPENDENCY_BLOCKED:
      score += gapMagnitude >= 2 ? 2 : 1;
      break;
    case GapStatus.PARTIAL:
      score += 0.5;
      break;
    case GapStatus.UNASSESSED:
    case GapStatus.INSUFFICIENT_EVIDENCE:
      score +=
        importance === RoleSkillImportance.CORE
          ? 1.5
          : importance === RoleSkillImportance.IMPORTANT
            ? 0.75
            : 0;
      break;
    case GapStatus.INCONSISTENT:
      score += 1;
      break;
  }

  if (isRootGap) score += 1.5;
  score += dependencyImpactScore * 1.5;

  if (score >= 5) return Severity.CRITICAL;
  if (score >= 3.5) return Severity.HIGH;
  if (score >= 1.5) return Severity.MEDIUM;
  return Severity.LOW;
}
