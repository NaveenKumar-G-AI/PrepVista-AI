import { ConfidenceLevel, EvidenceInput } from '../types/feature40.types';

/**
 * Confidence and freshness are ALWAYS computed here -- deterministically --
 * never by asking an LLM "how confident are you?" (spec ??57: dates,
 * thresholds, confidence, and source freshness are deterministic logic, not
 * AI). The AI layer (src/ai) is only ever allowed to *read* a ConfidenceLevel
 * this module produced and use it to phrase an explanation; it never assigns
 * one.
 */

export const MIN_SAMPLE_FOR_ANY_SIGNAL = 3;
const STRONG_SAMPLE_THRESHOLD = 25;
const RECENCY_FRESH_DAYS = 90;
const RECENCY_STALE_DAYS = 270;

export function computeConfidence(input: EvidenceInput): ConfidenceLevel {
  // Section 63 "Small Sample Protection": below this floor we do not even
  // attempt a HIGH/MODERATE/LOW read -- the honest answer is UNKNOWN.
  if (input.sampleSize < MIN_SAMPLE_FOR_ANY_SIGNAL) {
    return 'UNKNOWN';
  }

  let score = 0;
  // Sample size: up to 40 points, saturating at STRONG_SAMPLE_THRESHOLD so a
  // single enormous sample can't alone buy HIGH confidence (source quality
  // and recency still have to contribute).
  score += Math.min(40, (input.sampleSize / STRONG_SAMPLE_THRESHOLD) * 40);
  // Source quality (see AI_SOURCE_HIERARCHY weights below): up to 30 points.
  score += clamp01(input.sourceQuality) * 30;
  // Recency: up to 20 points, decaying linearly to 0 between "fresh" and
  // "stale" (spec ??61 Stale Data Protection feeds this).
  const recencyFactor =
    input.recencyDays <= RECENCY_FRESH_DAYS
      ? 1
      : Math.max(0, 1 - (input.recencyDays - RECENCY_FRESH_DAYS) / (RECENCY_STALE_DAYS - RECENCY_FRESH_DAYS));
  score += recencyFactor * 20;
  // Cross-source agreement: up to 10 points (spec ??62 Conflicting Sources --
  // low agreement caps confidence even with a large, fresh sample).
  score += clamp01(input.sourceAgreement) * 10;

  if (score >= 75) return 'HIGH';
  if (score >= 50) return 'MODERATE';
  return 'LOW';
}

export function isStale(lastUpdated: Date, referenceDate: Date = new Date()): boolean {
  return daysBetween(lastUpdated, referenceDate) > RECENCY_STALE_DAYS;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function hasInsufficientEvidence(sampleSize: number): boolean {
  return sampleSize < MIN_SAMPLE_FOR_ANY_SIGNAL;
}

/** Source hierarchy weights (spec ??58). Higher tier => higher sourceQuality
 * input to computeConfidence. AI_INFERENCE deliberately sits at the bottom:
 * an AI-generated interpretation of real data is not itself evidence. */
export const SOURCE_QUALITY_WEIGHTS: Record<string, number> = {
  VERIFIED_MARKET_DATA: 1.0,
  EMPLOYER_JOB_DATA: 0.85,
  PLATFORM_HISTORICAL_DATA: 0.7,
  TRUSTED_RESEARCH: 0.65,
  STUDENT_DATA: 0.4,
  AI_INFERENCE: 0.2,
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
