import {
  CapabilityEvidenceLabel,
  ClaimComparisonResult,
  RequiredLevel,
  REQUIRED_LEVEL_ORDER,
  labelToLevelRank,
} from '../types/domain';

function titleCase(level: RequiredLevel): string {
  return level.charAt(0) + level.slice(1).toLowerCase();
}

/**
 * Compares what a student claims about themselves (self-report, resume
 * language) against what the evidence actually supports. Neutral language
 * only — this never calls a student dishonest, and it never silently
 * rewrites their resume. It just states what the evidence does or doesn't
 * currently support, in both directions:
 *
 *  - OVERCLAIM: the claim sits well above the evidence.
 *  - UNDERCLAIM: the evidence sits well above the claim.
 *  - ALIGNED: claim and evidence are broadly consistent.
 *  - NO_CLAIM: nothing to compare against.
 */
export function compareClaimToEvidence(
  claimedLevel: RequiredLevel | null | undefined,
  evidenceLabel: CapabilityEvidenceLabel
): ClaimComparisonResult {
  if (!claimedLevel) {
    return { status: 'NO_CLAIM', message: 'No self-described level was provided for this capability.' };
  }

  const claimRank = REQUIRED_LEVEL_ORDER.indexOf(claimedLevel);
  const evidenceRank = labelToLevelRank(evidenceLabel);

  if (claimRank - evidenceRank >= 2) {
    return {
      status: 'OVERCLAIM',
      message: `Current evidence is insufficient to validate a "${titleCase(claimedLevel)}" level for this capability.`,
    };
  }

  if (evidenceRank - claimRank >= 2) {
    return {
      status: 'UNDERCLAIM',
      message: 'Available evidence appears stronger than the current self-described level for this capability.',
    };
  }

  return { status: 'ALIGNED', message: 'The self-described level is broadly consistent with available evidence.' };
}
