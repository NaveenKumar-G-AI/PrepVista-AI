import { MASTERY_LEVELS, masteryRank, rankToMastery } from '../config';
import type { EvidenceEvent, EvidenceOutcome, MasteryState, Trend } from '../domain/types';

/**
 * NOTE ON SCOPE: the brief assumes an "existing Adaptive Coding Mastery
 * Engine" that already turns challenge attempts into mastery/confidence/
 * trend. No such system exists in this environment (see docs/ARCHITECTURE.md
 * PHASE 0 discovery notes). This module is the minimal, real, deterministic
 * stand-in that fulfills the same contract: given evidence, produce mastery
 * level + confidence + trend + evidence count. Everything above this layer
 * (gap analysis, priority, roadmap generation) treats this as the sole
 * source of truth and never recomputes a second, conflicting mastery model.
 */

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function emptyMasteryState(studentId: string, skillId: string): MasteryState {
  return {
    studentId,
    skillId,
    masteryLevel: null,
    confidence: 0,
    evidenceCount: 0,
    trend: null,
    recentOutcomes: [],
    lastEvidenceAt: null,
  };
}

function outcomeScore(o: EvidenceOutcome): number {
  if (o === 'SUCCESS') return 1;
  if (o === 'PARTIAL') return 0;
  return -1;
}

export function computeTrend(recentOutcomes: EvidenceOutcome[]): Trend | null {
  if (recentOutcomes.length < 2) return recentOutcomes.length === 1 ? 'STABLE' : null;
  const half = Math.ceil(recentOutcomes.length / 2);
  const firstHalf = recentOutcomes.slice(0, recentOutcomes.length - half).map(outcomeScore);
  const secondHalf = recentOutcomes.slice(recentOutcomes.length - half).map(outcomeScore);
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const diff = avg(secondHalf) - avg(firstHalf);
  if (diff > 0.3) return 'IMPROVING';
  if (diff < -0.3) return 'DECLINING';
  return 'STABLE';
}

/**
 * Pure function: (current state, one evidence event) -> next state.
 * Rules (documented, not hidden):
 *  - SUCCESS raises confidence; independent attempts count for more than
 *    hinted/assisted ones. Crossing a confidence threshold promotes a level
 *    and confidence partially resets (you have to re-earn it at the new
 *    level — this is what keeps "10 problems solved" from being conflated
 *    with mastery, per Phase 23).
 *  - PARTIAL nudges confidence down slightly.
 *  - FAIL costs more confidence than a SUCCESS gains, and repeated failure
 *    can demote a level — this is how a real weakness (e.g. Queues) becomes
 *    visible from evidence rather than being asserted.
 *  - SYNTAX-category failures in a non-preferred language are weighted much
 *    less harshly than LOGIC failures (Phase 29): syntax slips are not
 *    algorithmic weakness.
 */
export function applyEvidence(state: MasteryState, ev: EvidenceEvent): MasteryState {
  const next: MasteryState = { ...state, recentOutcomes: [...state.recentOutcomes] };
  next.evidenceCount += 1;
  next.lastEvidenceAt = ev.createdAt ?? new Date().toISOString();

  let rankIdx = state.masteryLevel ? (masteryRank(state.masteryLevel) as number) : 0;

  const isSyntaxSlip = ev.outcome === 'FAIL' && ev.failureCategory === 'SYNTAX';

  if (ev.outcome === 'SUCCESS') {
    const bump = ev.independent ? 0.22 : 0.08;
    next.confidence = clamp01(state.confidence + bump);
    if (next.confidence >= 0.65 && rankIdx < MASTERY_LEVELS.length - 1) {
      rankIdx += 1;
      next.confidence = 0.55; // re-earn confidence at the new level
    }
  } else if (ev.outcome === 'PARTIAL') {
    next.confidence = clamp01(state.confidence - 0.05);
  } else {
    // FAIL
    const penalty = isSyntaxSlip ? 0.06 : 0.25;
    next.confidence = clamp01(state.confidence - penalty);
    if (!isSyntaxSlip && next.confidence <= 0.25 && rankIdx > 0) {
      rankIdx -= 1;
      next.confidence = 0.35;
    }
  }

  next.masteryLevel = rankToMastery(rankIdx);
  next.recentOutcomes = [...next.recentOutcomes.slice(-4), ev.outcome];
  next.trend = computeTrend(next.recentOutcomes);
  return next;
}

export function applyEvidenceBatch(initial: MasteryState, events: EvidenceEvent[]): MasteryState {
  return events.reduce((state, ev) => applyEvidence(state, ev), initial);
}
