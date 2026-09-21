import type { EvidenceAggregate, EvidenceEventLike } from '../domain/types';

// These thresholds are a clearly-labeled REFERENCE heuristic standing in for
// ACEAPT's real Mastery Engine (spec section 39 explicitly says Feature 45
// must not implement another mastery algorithm). MasteryEngineAdapter is the
// integration seam: once wired to the real engine, this function is only
// used as the stub adapter's fallback, never as the system of record.
const RECENCY_DECAY = 0.9; // more recent evidence counts more
const STRONG_THRESHOLD = 60;
const MASTERED_THRESHOLD = 85;
const TREND_DELTA_THRESHOLD = 8; // percentage points
const MIN_EVENTS_FOR_TREND = 4;

function confidenceFor(evidenceCount: number) {
  if (evidenceCount === 0) return 'NONE' as const;
  if (evidenceCount < 3) return 'LOW' as const;
  if (evidenceCount < 10) return 'MODERATE' as const;
  return 'HIGH' as const;
}

function pctCorrect(events: EvidenceEventLike[]): number {
  if (!events.length) return 0;
  const gradable = events.filter((e) => e.isCorrect !== null);
  if (!gradable.length) return 0;
  return (gradable.filter((e) => e.isCorrect).length / gradable.length) * 100;
}

/**
 * Aggregates a student's raw evidence events into a capability estimate,
 * state, trend and confidence. Pure function — no DB access — so every
 * branch (no evidence, low evidence, mastered, declining, etc.) is directly
 * unit-testable (section 74).
 *
 * `retentionDeclining` is a signal from RetentionEngineAdapter (section 40);
 * this function does not compute retention itself.
 */
export function aggregateEvidence(events: EvidenceEventLike[], retentionDeclining = false): EvidenceAggregate {
  if (events.length === 0) {
    // Section 23/25: no evidence is UNKNOWN, never a fabricated low score.
    return { capability: null, state: 'UNKNOWN', trend: null, evidenceCount: 0, confidence: 'NONE' };
  }

  const sorted = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const gradable = sorted.filter((e) => e.isCorrect !== null);

  let capability: number | null = null;
  if (gradable.length > 0) {
    let weightedCorrect = 0;
    let weightedTotal = 0;
    gradable.forEach((e, idx) => {
      const recencyBoost = Math.pow(RECENCY_DECAY, gradable.length - 1 - idx);
      const w = (e.weight ?? 1) * recencyBoost;
      weightedTotal += w;
      if (e.isCorrect) weightedCorrect += w;
    });
    capability = weightedTotal > 0 ? Math.round((weightedCorrect / weightedTotal) * 100) : null;
  }

  const evidenceCount = events.length;
  const confidence = confidenceFor(evidenceCount);

  let trend: EvidenceAggregate['trend'] = null;
  if (gradable.length >= MIN_EVENTS_FOR_TREND) {
    const mid = Math.floor(gradable.length / 2);
    const firstAvg = pctCorrect(gradable.slice(0, mid));
    const secondAvg = pctCorrect(gradable.slice(mid));
    if (secondAvg - firstAvg > TREND_DELTA_THRESHOLD) trend = 'IMPROVING';
    else if (firstAvg - secondAvg > TREND_DELTA_THRESHOLD) trend = 'DECLINING';
    else trend = 'STABLE';
  }

  let state: EvidenceAggregate['state'];
  if (capability === null) {
    state = 'UNKNOWN';
  } else if (capability >= MASTERED_THRESHOLD) {
    state = retentionDeclining ? 'MAINTENANCE' : 'MASTERED';
  } else if (capability >= STRONG_THRESHOLD) {
    state = 'STRONG';
  } else {
    state = 'DEVELOPING';
  }

  return { capability, state, trend, evidenceCount, confidence };
}
