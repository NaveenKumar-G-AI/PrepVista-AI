import type { SkillEvidence } from '../types/evidence.js';
import type { TrajectoryLabel, SkillStateLabel } from '../types/skill-state.js';
import { growthRules } from '../config/growth-rules.js';
import { aggregateEvidence } from '../skill-state/aggregate.js';

/**
 * Growth Trajectory (section 15-16). Classifies the *rate and direction*
 * of change using rolling windowed comparisons rather than a single
 * before/after delta, so a trend needs to show up in more than one
 * measurement before it's reported as a trend. Deliberately returns a
 * qualitative label (never a fake-precise "+17%" — section 16).
 */

export interface TrajectoryResult {
  trajectory: TrajectoryLabel;
  recentScore: number | null;
  priorScore: number | null;
  recentEvidenceCount: number;
  priorEvidenceCount: number;
}

function windowSlice(evidence: SkillEvidence[], nowMs: number, fromDaysAgo: number, toDaysAgo: number): SkillEvidence[] {
  const from = nowMs - fromDaysAgo * 86_400_000;
  const to = nowMs - toDaysAgo * 86_400_000;
  return evidence.filter((e) => {
    const t = new Date(e.timestamp).getTime();
    return t >= from && t < to;
  });
}

function classifyDelta(recentDelta: number, priorDelta: number | null): TrajectoryLabel {
  const { rapidlyImprovingDelta, improvingDelta, stableBand, decliningDelta, slowingMargin } = growthRules.trajectory;

  if (recentDelta >= rapidlyImprovingDelta) return 'RAPIDLY_IMPROVING';

  if (recentDelta >= improvingDelta) {
    if (priorDelta !== null && priorDelta > recentDelta + slowingMargin) return 'SLOWING';
    return 'IMPROVING';
  }

  if (Math.abs(recentDelta) < stableBand) return 'STABLE';

  if (recentDelta <= decliningDelta) return 'DECLINING';

  return 'STABLE';
}

/**
 * `previousRecordedState` lets a trend that is technically "improving"
 * still be reported as RECOVERING when the student's last officially
 * recorded state was AT_RISK/REGRESSING — the direction is the same
 * information, but the framing matters (section 24).
 */
export function computeTrajectory(
  evidence: SkillEvidence[],
  nowIso: string = new Date().toISOString(),
  previousRecordedState: SkillStateLabel | null = null,
): TrajectoryResult {
  const nowMs = new Date(nowIso).getTime();
  const { shortTermDays } = growthRules.timeWindows;
  const { minEvidencePerWindow, minEvidenceForFallbackTrend } = growthRules.trajectory;

  const recentWindow = windowSlice(evidence, nowMs, shortTermDays, 0);
  const priorWindow = windowSlice(evidence, nowMs, shortTermDays * 2, shortTermDays);
  const beforePriorWindow = windowSlice(evidence, nowMs, shortTermDays * 3, shortTermDays * 2);

  let recentAgg = aggregateEvidence(recentWindow, nowIso);
  let priorAgg = aggregateEvidence(priorWindow, nowIso);

  if (recentAgg.evidenceCount < minEvidencePerWindow || priorAgg.evidenceCount < minEvidencePerWindow) {
    // Not enough evidence in the tight windows — fall back to a coarser
    // first-half vs second-half split of the whole history, if there's
    // enough history at all to make that meaningful.
    if (evidence.length < minEvidenceForFallbackTrend) {
      return {
        trajectory: 'INSUFFICIENT_EVIDENCE',
        recentScore: recentAgg.score,
        priorScore: priorAgg.score,
        recentEvidenceCount: recentAgg.evidenceCount,
        priorEvidenceCount: priorAgg.evidenceCount,
      };
    }
    const sorted = [...evidence].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const mid = Math.floor(sorted.length / 2);
    priorAgg = aggregateEvidence(sorted.slice(0, mid), nowIso);
    recentAgg = aggregateEvidence(sorted.slice(mid), nowIso);
  }

  if (recentAgg.score === null || priorAgg.score === null) {
    return {
      trajectory: 'INSUFFICIENT_EVIDENCE',
      recentScore: recentAgg.score,
      priorScore: priorAgg.score,
      recentEvidenceCount: recentAgg.evidenceCount,
      priorEvidenceCount: priorAgg.evidenceCount,
    };
  }

  const recentDelta = recentAgg.score - priorAgg.score;
  const beforePriorAgg = aggregateEvidence(beforePriorWindow, nowIso);
  const priorDelta = beforePriorAgg.score !== null && beforePriorWindow.length >= minEvidencePerWindow ? priorAgg.score - beforePriorAgg.score : null;

  let trajectory = classifyDelta(recentDelta, priorDelta);

  if ((trajectory === 'IMPROVING' || trajectory === 'RAPIDLY_IMPROVING') && (previousRecordedState === 'AT_RISK' || previousRecordedState === 'REGRESSING')) {
    trajectory = 'RECOVERING';
  }

  return {
    trajectory,
    recentScore: recentAgg.score,
    priorScore: priorAgg.score,
    recentEvidenceCount: recentAgg.evidenceCount,
    priorEvidenceCount: priorAgg.evidenceCount,
  };
}
