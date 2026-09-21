import { STATE_RANK } from './config.js';
import type { GapCategory, GapDiagnosis, PrerequisiteState, SkillEvidence, SkillRelationship } from './types.js';

const REQUIRED_PREREQUISITE_RANK = STATE_RANK.FUNCTIONAL;

/**
 * PHASE 17 / 18: when a skill isn't progressing, figure out WHY before
 * recommending more of the same. Prerequisite gaps take priority over
 * within-skill failure classification — throwing more DP problems at a
 * student who hasn't internalized recursion just produces more failure
 * evidence, not learning.
 */
export function diagnoseGap(
  skillId: string,
  recentFailures: SkillEvidence[],
  prerequisites: PrerequisiteState[],
  relationships: SkillRelationship[]
): GapDiagnosis {
  const weakPrereq = prerequisites
    .filter((p) =>
      relationships.some(
        (r) => r.toSkillId === skillId && r.fromSkillId === p.skillId && (r.type === 'PREREQUISITE' || r.type === 'DEPENDS_ON')
      )
    )
    .find((p) => STATE_RANK[p.state] < REQUIRED_PREREQUISITE_RANK);

  if (weakPrereq) {
    return {
      skillId,
      category: 'PREREQUISITE_GAP',
      targetSkillId: weakPrereq.skillId,
      reasons: [
        `${skillId} depends on ${weakPrereq.skillId}, which is currently ${weakPrereq.state}.`,
        'Recommending the prerequisite instead of more attempts at the target skill.',
      ],
    };
  }

  if (recentFailures.length === 0) {
    return {
      skillId,
      category: 'NEEDS_REVIEW',
      targetSkillId: skillId,
      reasons: ['No recent failure evidence available to classify the gap further.'],
    };
  }

  const reasonCounts = new Map<string, number>();
  for (const f of recentFailures) {
    const r = f.failureReason ?? 'UNKNOWN';
    reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
  }
  const [topReason] = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]);
  const category = mapFailureReasonToGapCategory(topReason?.[0]);

  return {
    skillId,
    category,
    targetSkillId: skillId,
    reasons: [`${topReason?.[1] ?? 0} of the last ${recentFailures.length} independent attempts show a ${topReason?.[0] ?? 'UNKNOWN'} pattern.`],
  };
}

function mapFailureReasonToGapCategory(reason?: string): GapCategory {
  switch (reason) {
    case 'EDGE_CASE':
      return 'EDGE_CASE_GAP';
    case 'WRONG_COMPLEXITY':
      return 'COMPLEXITY_GAP';
    case 'RUNTIME_ERROR':
      return 'DEBUGGING_GAP';
    case 'COMPILE_ERROR':
      return 'LANGUAGE_GAP';
    case 'WRONG_APPROACH':
      return 'ALGORITHM_SELECTION_GAP';
    case 'NO_SUBMISSION':
      return 'PATTERN_RECOGNITION_GAP';
    default:
      return 'NEEDS_REVIEW';
  }
}
