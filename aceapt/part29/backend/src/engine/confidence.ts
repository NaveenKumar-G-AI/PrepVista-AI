import { CapabilityEvidenceEvent, ConfidenceBand, EvidenceConfidence } from '../domain/types';

/**
 * Evidence confidence engine.
 *
 * Deliberately independent of level (spec §12): a MEDIUM capability seen in
 * twelve consistent, recent, varied-difficulty attempts should read as more
 * trustworthy than a STRONG capability seen once. This module only answers
 * "how much should we trust this reading", never "what is the reading".
 */

const HALF_LIFE_DAYS = 60; // recency decay half-life
const SATURATING_ATTEMPT_COUNT = 6; // attempts beyond this add little extra confidence

const WEIGHTS = {
  count: 0.28,
  recency: 0.18,
  difficultyVariety: 0.14,
  novelty: 0.12,
  timedCoverage: 0.1,
  measurementConsistency: 0.1,
  proofVerified: 0.08,
} as const;

const BAND_THRESHOLDS = { low: 0.35, high: 0.7 };

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = mean(values.map((v) => (v - m) ** 2));
  return Math.sqrt(variance);
}

function daysSince(iso: string, now: Date): number {
  const then = new Date(iso).getTime();
  return Math.max(0, (now.getTime() - then) / (1000 * 60 * 60 * 24));
}

function recencyWeight(days: number): number {
  return Math.pow(0.5, days / HALF_LIFE_DAYS);
}

export function calculateEvidenceConfidence(
  events: CapabilityEvidenceEvent[],
  now: Date = new Date(),
): EvidenceConfidence {
  if (events.length === 0) {
    return {
      band: 'LOW',
      score: 0,
      attemptCount: 0,
      proofVerifiedCount: 0,
      mostRecentAt: null,
      reasons: ['No evidence recorded for this capability yet'],
    };
  }

  const attemptCount = events.length;
  const proofVerifiedCount = events.filter((e) => e.proofVerified).length;
  const mostRecentAt = events
    .map((e) => e.occurredAt)
    .sort()
    .reverse()[0]!;

  const countFactor = clamp01(attemptCount / SATURATING_ATTEMPT_COUNT);

  const recencyFactor = mean(events.map((e) => recencyWeight(daysSince(e.occurredAt, now))));

  const difficulties = events.map((e) => e.difficulty);
  // Spread of difficulty attempted, not just the count — evidence gathered
  // across a range of difficulties is more convincing than the same easy
  // item repeated. stddev of a 0..1 range saturates around ~0.5, so we
  // rescale generously.
  const difficultyVarietyFactor = clamp01(stddev(difficulties) * 2.2);

  const noveltyFactor = mean(events.map((e) => e.novelty));

  const timedCoverageFactor = clamp01(events.filter((e) => e.timed).length / attemptCount);

  const performances = events.map((e) => e.performance);
  // Low variance in observed performance = a reliable, repeatable reading.
  // High variance = noisy signal, regardless of the average.
  const measurementConsistencyFactor = clamp01(1 - stddev(performances) * 2);

  const proofVerifiedFactor = clamp01(proofVerifiedCount / attemptCount);

  const score =
    countFactor * WEIGHTS.count +
    recencyFactor * WEIGHTS.recency +
    difficultyVarietyFactor * WEIGHTS.difficultyVariety +
    noveltyFactor * WEIGHTS.novelty +
    timedCoverageFactor * WEIGHTS.timedCoverage +
    measurementConsistencyFactor * WEIGHTS.measurementConsistency +
    proofVerifiedFactor * WEIGHTS.proofVerified;

  const band: ConfidenceBand =
    score < BAND_THRESHOLDS.low ? 'LOW' : score < BAND_THRESHOLDS.high ? 'MEDIUM' : 'HIGH';

  const reasons: string[] = [`${attemptCount} attempt${attemptCount === 1 ? '' : 's'} recorded`];
  if (proofVerifiedCount > 0) {
    reasons.push(`${proofVerifiedCount} proof-verified`);
  }
  if (recencyFactor < 0.4) {
    reasons.push('most evidence is not recent');
  }
  if (difficultyVarietyFactor < 0.3) {
    reasons.push('evidence spans a narrow difficulty range');
  }
  if (measurementConsistencyFactor < 0.4) {
    reasons.push('performance has varied a lot across attempts');
  }

  return { band, score: clamp01(score), attemptCount, proofVerifiedCount, mostRecentAt, reasons };
}
