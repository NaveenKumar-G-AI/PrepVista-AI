import { SkillEvidencePoint, SkillState, SkillLevel } from '../types';

/**
 * Evidence aggregation — the core "don't overreact to one data point" logic
 * described throughout the spec (Evidence Freshness, Do Not Overfit To One
 * Success, Do Not Overfit To One Failure, Recent-Performance Weighting).
 *
 * This module is intentionally pure/deterministic: computeSkillState() is a
 * function of (evidence list, now), so it is trivially testable and its
 * output is fully reconstructible for audit purposes.
 */

const MS_PER_DAY = 86_400_000;
const RECENCY_HALF_LIFE_DAYS = 21; // recent evidence matters more, but decays slowly
const RECENCY_FLOOR = 0.15; // old evidence never fully drops to zero weight
const DIVERSITY_CONTEXT_TARGET = 3;

// How far a single most-recent, uncorroborated event may move the score
// away from the trend established by everything before it.
const MAX_UNCORROBORATED_SUCCESS_DELTA = 8;
const MAX_UNCORROBORATED_FAILURE_DELTA = 10;

function daysSince(iso: string, now: number): number {
  return (now - new Date(iso).getTime()) / MS_PER_DAY;
}

/**
 * Blends correctness with reasoning/understanding/consistency/debugging
 * sub-scores where present, so a "success" that was a shallow, unexplained
 * pass scores lower than a well-reasoned, well-understood one — and applies
 * a small penalty for heavy hint use or many attempts.
 */
function outcomeValue(e: SkillEvidencePoint): number {
  const parts: number[] = [];
  if (e.correctness !== undefined) {
    parts.push(e.correctness * 100);
  } else {
    parts.push(e.outcome === 'SUCCESS' ? 85 : e.outcome === 'PARTIAL' ? 50 : 20);
  }
  if (e.reasoningScore !== undefined) parts.push(e.reasoningScore);
  if (e.understandingScore !== undefined) parts.push(e.understandingScore);
  if (e.consistencyScore !== undefined) parts.push(e.consistencyScore);
  if (e.debuggingScore !== undefined) parts.push(e.debuggingScore);

  const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
  const hintPenalty = e.hintsUsed ? Math.min(10, e.hintsUsed * 3) : 0;
  const attemptPenalty = e.attempts && e.attempts > 1 ? Math.min(8, (e.attempts - 1) * 2) : 0;
  return Math.max(0, Math.min(100, avg - hintPenalty - attemptPenalty));
}

/** "Corroborated" = more than bare correctness — understanding, reasoning, or transfer was also shown. */
function hasCorroboration(e: SkillEvidencePoint): boolean {
  return (
    (e.understandingScore !== undefined && e.understandingScore >= 60) ||
    (e.reasoningScore !== undefined && e.reasoningScore >= 60) ||
    !!e.transferGroup
  );
}

export function computeSkillState(
  skillId: string,
  evidence: SkillEvidencePoint[],
  now: number = Date.now()
): SkillState {
  if (evidence.length === 0) {
    return {
      skillId,
      level: 'UNKNOWN',
      score: 0,
      confidence: 0,
      trend: 'INSUFFICIENT_DATA',
      lastDemonstratedAt: null,
      evidenceCount: 0,
      distinctContexts: 0,
      rawRecencyScore: 0,
      dampened: false,
    };
  }

  const sorted = [...evidence].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // --- naive recency-weighted average ---
  let weightedSum = 0;
  let weightTotal = 0;
  for (const e of sorted) {
    const age = daysSince(e.timestamp, now);
    const decay = Math.pow(0.5, age / RECENCY_HALF_LIFE_DAYS);
    const weight = RECENCY_FLOOR + (1 - RECENCY_FLOOR) * decay;
    weightedSum += weight * outcomeValue(e);
    weightTotal += weight;
  }
  const naiveScore = weightedSum / weightTotal;

  // --- historical anchor (unweighted long-run average) ---
  const historicalAvg = sorted.reduce((sum, e) => sum + outcomeValue(e), 0) / sorted.length;

  // --- overfit guards on the single most recent event ---
  const priorEvidence = sorted.slice(0, -1);
  const latest = sorted[sorted.length - 1];
  let dampened = false;
  let anchoredScore = naiveScore;

  if (priorEvidence.length >= 2) {
    const priorScore =
      priorEvidence.reduce((sum, e) => sum + outcomeValue(e), 0) / priorEvidence.length;
    const rawDelta = naiveScore - priorScore;
    const corroborated = hasCorroboration(latest);

    if (latest.outcome === 'SUCCESS' && rawDelta > 0 && !corroborated) {
      const cappedDelta = Math.min(rawDelta, MAX_UNCORROBORATED_SUCCESS_DELTA);
      if (cappedDelta < rawDelta) dampened = true;
      anchoredScore = priorScore + cappedDelta;
    } else if (latest.outcome === 'FAILURE' && rawDelta < 0 && !corroborated) {
      const establishedTrackRecord = priorScore >= 55 && priorEvidence.length >= 3;
      const cap = establishedTrackRecord
        ? MAX_UNCORROBORATED_FAILURE_DELTA
        : MAX_UNCORROBORATED_FAILURE_DELTA * 2; // thinner track record = less protection
      const cappedDelta = Math.max(rawDelta, -cap);
      if (cappedDelta > rawDelta) dampened = true;
      anchoredScore = priorScore + cappedDelta;
    }
  }

  // Blend the anchored recency estimate with the historical average: a
  // long-mastered skill shouldn't evaporate after a short rough patch, and
  // a skill that has always struggled shouldn't be "rescued" by one good day.
  const blendFactor = Math.min(0.7, 0.25 + sorted.length * 0.05);
  const score = blendFactor * anchoredScore + (1 - blendFactor) * historicalAvg;

  // --- confidence ---
  const distinctContexts = new Set(
    sorted.map((e) => e.transferGroup || e.challengeFamily || e.challengeId)
  ).size;
  const recencyOfLast = daysSince(latest.timestamp, now);
  const countFactor = Math.min(1, sorted.length / 8);
  const diversityFactor = Math.min(1, distinctContexts / DIVERSITY_CONTEXT_TARGET);
  const stalenessFactor = Math.max(0.3, Math.pow(0.5, recencyOfLast / 60));
  const variance =
    sorted.reduce((s, e) => s + Math.pow(outcomeValue(e) - historicalAvg, 2), 0) / sorted.length;
  const consistencyFactor = Math.max(0.4, 1 - Math.min(1, variance / 2500));
  const confidence = Math.max(
    0,
    Math.min(
      1,
      0.15 +
        0.35 * countFactor +
        0.25 * diversityFactor +
        0.15 * stalenessFactor +
        0.1 * consistencyFactor
    )
  );

  // --- trend ---
  let trend: SkillState['trend'] = 'INSUFFICIENT_DATA';
  if (sorted.length >= 3) {
    const mid = Math.ceil(sorted.length / 2);
    const olderHalf = sorted.slice(0, mid);
    const recentHalf = sorted.slice(mid);
    const recentAvg = recentHalf.reduce((s, e) => s + outcomeValue(e), 0) / recentHalf.length;
    const olderAvg = olderHalf.reduce((s, e) => s + outcomeValue(e), 0) / olderHalf.length;
    if (recentAvg - olderAvg > 8) trend = 'IMPROVING';
    else if (olderAvg - recentAvg > 8) trend = 'DECLINING';
    else trend = 'STABLE';
  }

  const level = classifyLevel({
    score,
    confidence,
    trend,
    evidenceCount: sorted.length,
    distinctContexts,
    recencyOfLastDays: recencyOfLast,
  });

  return {
    skillId,
    level,
    score,
    confidence,
    trend,
    lastDemonstratedAt: latest.timestamp,
    evidenceCount: sorted.length,
    distinctContexts,
    rawRecencyScore: naiveScore,
    dampened,
  };
}

function classifyLevel(args: {
  score: number;
  confidence: number;
  trend: SkillState['trend'];
  evidenceCount: number;
  distinctContexts: number;
  recencyOfLastDays: number;
}): SkillLevel {
  const { score, confidence, trend, evidenceCount, distinctContexts, recencyOfLastDays } = args;

  if (evidenceCount === 0) return 'UNKNOWN';
  if (confidence < 0.35) return 'UNCERTAIN';

  // Mastery requires diversified, confident evidence — not one hard
  // problem solved once. See "Mastery Confirmation" in the spec.
  if (score >= 82 && distinctContexts >= DIVERSITY_CONTEXT_TARGET && confidence >= 0.6) {
    if (trend === 'DECLINING' && recencyOfLastDays > 45) return 'AT_RISK';
    return 'MASTERED';
  }
  if (score >= 70) {
    return trend === 'DECLINING' ? 'REGRESSING' : 'PROFICIENT';
  }
  if (score >= 50) return 'PRACTICED';
  if (score >= 30) return 'DEVELOPING';
  return 'INTRODUCED';
}
