import {
  CapabilityEvidenceResult,
  CapabilityRequirement,
  CapabilityStatus,
  ConfidenceLevel,
  ReadinessGap,
  ReadinessResult,
  ReadinessState,
  REQUIRED_LEVEL_ORDER,
  labelToLevelRank,
} from '../types/domain';

const CORE_IMPORTANCE = 3;
const RELEVANT_FOR_CONFIDENCE_IMPORTANCE = 2; // core + secondary count toward confidence; nice-to-haves don't

/** Below this share of requirements having *any* evidence at all, the student is still just exploring. */
const EXPLORING_EVIDENCE_COVERAGE_THRESHOLD = 0.34;

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function unknownEvidence(capabilityId: string): CapabilityEvidenceResult {
  return {
    capabilityId,
    label: 'UNKNOWN',
    achievedClass: null,
    confidence: 'LOW',
    independentSourceCount: 0,
    freshestEvidenceDate: null,
    freshnessState: null,
    hasConflict: false,
    conflictExplanation: null,
    contributingEvidenceIds: [],
    reasons: ['No evidence has been recorded for this capability yet.'],
  };
}

function meetsRequirement(requiredLevel: CapabilityStatus['requiredLevel'], ev: CapabilityEvidenceResult): boolean {
  const requiredRank = REQUIRED_LEVEL_ORDER.indexOf(requiredLevel);
  const evidenceRank = labelToLevelRank(ev.label);
  // Conflicting evidence never satisfies a requirement on its own, even if the top score would otherwise qualify —
  // the disagreement itself is the open question.
  return evidenceRank >= requiredRank && !ev.hasConflict;
}

function toGap(status: CapabilityStatus): ReadinessGap {
  const distance = REQUIRED_LEVEL_ORDER.indexOf(status.requiredLevel) - labelToLevelRank(status.label);
  return {
    capabilityId: status.capabilityId,
    capabilityName: status.capabilityName,
    requiredLevel: status.requiredLevel,
    currentLabel: status.label,
    importance: status.importance,
    distance,
  };
}

function computeReadinessConfidence(statuses: CapabilityStatus[]): ConfidenceLevel {
  const relevant = statuses.filter((s) => s.importance >= RELEVANT_FOR_CONFIDENCE_IMPORTANCE);
  if (relevant.length === 0) return 'LOW';

  const anyConflict = relevant.some((s) => s.hasConflict);
  if (anyConflict) return 'LOW';

  const anyStale = relevant.some((s) => s.freshnessState === 'STALE' || s.freshnessState === 'REVALIDATION_RECOMMENDED');
  const avgSources = average(relevant.map((s) => s.independentSourceCount));

  if (avgSources >= 3 && !anyStale) return 'HIGH';
  if (avgSources >= 1.5) return 'MEDIUM';
  return 'LOW';
}

function determineState(statuses: CapabilityStatus[]): ReadinessState {
  const total = statuses.length;
  if (total === 0) return 'UNKNOWN';

  const withAnyEvidence = statuses.filter((s) => s.achievedClass !== null).length;
  const evidenceCoverage = withAnyEvidence / total;

  if (evidenceCoverage === 0) return 'UNKNOWN';
  if (evidenceCoverage < EXPLORING_EVIDENCE_COVERAGE_THRESHOLD) return 'EXPLORING';

  const coreReqs = statuses.filter((s) => s.importance === CORE_IMPORTANCE);
  const coreTotal = coreReqs.length;
  const coreMet = coreReqs.filter((s) => s.meetsRequirement).length;
  const fractionCoreMet = coreTotal === 0 ? statuses.filter((s) => s.meetsRequirement).length / total : coreMet / coreTotal;

  if (fractionCoreMet === 0) return 'BUILDING';
  if (fractionCoreMet < 0.5) return 'DEVELOPING';
  if (fractionCoreMet < 1) return 'VALIDATING';

  // All core requirements are met. Distinguish "ready to test" from "strong evidence":
  const allMet = statuses.every((s) => s.meetsRequirement);
  const allStrong = statuses.every((s) => s.label === 'STRONG');
  if (allMet && allStrong) return 'STRONG_EVIDENCE';
  return 'READY_TO_TEST';
}

function humanizeLabel(label: CapabilityStatus['label']): string {
  switch (label) {
    case 'UNKNOWN':
      return 'has not been validated yet';
    case 'LIMITED':
      return 'has limited evidence so far';
    case 'DEVELOPING':
      return 'is developing';
    case 'STRONG':
      return 'has strong evidence';
  }
}

function buildReadinessReasons(state: ReadinessState, statuses: CapabilityStatus[], gaps: ReadinessGap[]): string[] {
  const reasons: string[] = [];
  const coreMet = statuses.filter((s) => s.importance === CORE_IMPORTANCE && s.meetsRequirement);

  coreMet.forEach((s) => {
    reasons.push(`${s.capabilityName} capability ${s.label === 'STRONG' ? 'validated' : 'demonstrated'} against this role's requirement.`);
  });

  if ((state === 'READY_TO_TEST' || state === 'STRONG_EVIDENCE') && gaps.length === 0) {
    reasons.push('Every required capability for this role currently meets or exceeds its target level.');
  }

  if (gaps.length > 0) {
    const top = gaps[0];
    reasons.push(`${top.capabilityName} ${humanizeLabel(top.currentLabel)}, below the ${top.requiredLevel.toLowerCase()} level this role expects.`);
  }

  if (reasons.length === 0) {
    reasons.push('Not enough evidence has been recorded yet to explain a readiness state for this role.');
  }

  return reasons;
}

/**
 * Turns a role's (or opportunity's) capability requirements plus the
 * student's current per-capability evidence into a single explainable
 * readiness result.
 *
 * State progression is driven primarily by how many CORE (importance = 3)
 * requirements are currently met — reaching "ready to test" never requires
 * every single nice-to-have to be perfect, matching how the product should
 * behave: readiness gates are recommendations, not gatekeeping.
 *
 * Confidence is tracked completely separately from state, so an uncertain
 * conclusion is never presented as a certain one.
 */
export function computeReadiness(
  requirements: CapabilityRequirement[],
  evidenceByCapability: Map<string, CapabilityEvidenceResult>
): ReadinessResult {
  const statuses: CapabilityStatus[] = requirements.map((req) => {
    const ev = evidenceByCapability.get(req.capabilityId) ?? unknownEvidence(req.capabilityId);
    return {
      ...ev,
      capabilityName: req.capabilityName,
      requiredLevel: req.requiredLevel,
      importance: req.importance,
      meetsRequirement: meetsRequirement(req.requiredLevel, ev),
    };
  });

  const gaps = statuses
    .filter((s) => !s.meetsRequirement)
    .map(toGap)
    .sort((a, b) => b.importance - a.importance || b.distance - a.distance);

  const state = determineState(statuses);
  const confidence = computeReadinessConfidence(statuses);
  const reasons = buildReadinessReasons(state, statuses, gaps);

  return {
    state,
    confidence,
    capabilityStatuses: statuses,
    gaps,
    topGap: gaps[0] ?? null,
    reasons,
  };
}
