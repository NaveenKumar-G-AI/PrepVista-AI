import type { ApplicabilityResult, SessionMode, TrustState } from '../domain/enums';

export interface StandardMethodStats {
  accuracy: number;
  medianTimeMs: number;
}

export interface RecommendationCandidate {
  shortcutId: string;
  canonicalName: string;
  applicability: ApplicabilityResult;
  trustState: TrustState;
  reliability: number;
  avgTimeSavedRatio: number | null;
}

export interface RankedRecommendation {
  shortcutId: string;
  canonicalName: string;
  applicability: ApplicabilityResult;
  trustState: TrustState;
  reliability: number;
  rationale: string;
}

export interface RecommendationOutcome {
  allowed: boolean;
  reason?: string;
  recommended: RankedRecommendation | null;
  alternatives: RankedRecommendation[];
}

const USABLE_TRUST_STATES: TrustState[] = ['RELIABLE', 'TRUSTED'];
const USABLE_APPLICABILITY: ApplicabilityResult[] = ['APPLICABLE', 'CONDITIONALLY_APPLICABLE'];

function toRanked(c: RecommendationCandidate): RankedRecommendation {
  return {
    shortcutId: c.shortcutId,
    canonicalName: c.canonicalName,
    applicability: c.applicability,
    trustState: c.trustState,
    reliability: c.reliability,
    rationale:
      c.trustState === 'TRUSTED'
        ? 'Trusted for you: reliable and faster when its conditions hold. Still worth double-checking the conditions match before you rely on it every time (sec. 89).'
        : 'Showing promise but still developing - a reasonable option to practice, but verify applicability every time.',
  };
}

/**
 * Ranks applicable, personally-earned methods for one question and decides
 * whether to say anything at all (secs. 34-40, 89-92, 105-106, 191-192,
 * 234). Three separate refusal-to-recommend paths on purpose:
 *  1. Formal assessment without explicit permission -> no strategy help at all.
 *  2. Nothing applicable/trusted yet -> silently defer to the standard method.
 *  3. Best candidate doesn't clearly beat the student's own standard-method
 *     stats -> also defer, even though something *was* technically usable
 *     (sec. 191, "Personal method comparison" / sec. 277 test).
 */
export function buildRecommendation(params: {
  mode: SessionMode;
  assessmentAllowsStrategyAssistance: boolean;
  candidates: RecommendationCandidate[];
  standardMethodStats?: StandardMethodStats;
}): RecommendationOutcome {
  if (params.mode === 'FORMAL_ASSESSMENT' && !params.assessmentAllowsStrategyAssistance) {
    return {
      allowed: false,
      reason: 'Strategy assistance is not available during formal assessment (sec. 95, 234).',
      recommended: null,
      alternatives: [],
    };
  }

  const usable = params.candidates.filter(
    (c) => USABLE_APPLICABILITY.includes(c.applicability) && USABLE_TRUST_STATES.includes(c.trustState)
  );

  usable.sort((a, b) => {
    const rank = (t: TrustState) => (t === 'TRUSTED' ? 2 : 1);
    if (rank(b.trustState) !== rank(a.trustState)) return rank(b.trustState) - rank(a.trustState);
    if (b.reliability !== a.reliability) return b.reliability - a.reliability;
    return (b.avgTimeSavedRatio ?? 0) - (a.avgTimeSavedRatio ?? 0);
  });

  const top = usable[0];
  if (!top) {
    return { allowed: true, recommended: null, alternatives: [], reason: 'Nothing personally trusted for this problem family yet - your standard method is the safe default.' };
  }

  const savesNoTime = (top.avgTimeSavedRatio ?? 0) <= 0;
  const standardStats = params.standardMethodStats;
  const standardAtLeastAsGood = standardStats ? standardStats.accuracy >= top.reliability : false;

  if (savesNoTime && standardAtLeastAsGood) {
    return {
      allowed: true,
      recommended: null,
      alternatives: usable.map(toRanked),
      reason: 'Your standard method is currently at least as reliable and no slower for this problem family (sec. 191-192).',
    };
  }

  return { allowed: true, recommended: toRanked(top), alternatives: usable.slice(1).map(toRanked) };
}
