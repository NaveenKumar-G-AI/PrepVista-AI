import { EvaluationDimension, DimensionRating, ReadinessLabel } from '../types/domain';
import { QualitativeAssessment } from '../ai/schemas';

export interface DimensionInput {
  dimension: EvaluationDimension;
  /**
   * Absent (undefined) means the interview never produced an observable
   * signal for this dimension at all — e.g. the student never got to a
   * follow-up about space complexity. Present-but-deterministic-only means
   * a fact like "all tests passed" fully determines the rating without
   * needing an opinion. Present-with-aiAssessment means a qualitative call
   * was needed (e.g. "was the explanation clear").
   */
  evidence?: {
    deterministicRating?: DimensionRating;
    deterministicSummary?: string;
    aiAssessment?: QualitativeAssessment;
  };
}

export interface DimensionResult {
  dimension: EvaluationDimension;
  rating: DimensionRating;
  evidenceSummary: string;
}

/**
 * PHASE 52 lives entirely in this one function: a dimension with no
 * observed evidence is INSUFFICIENT_EVIDENCE, and that decision is made
 * BEFORE any AI is consulted — never derived from an AI opinion, and never
 * silently coerced into WEAK.
 */
export function rateDimension(input: DimensionInput): DimensionResult {
  if (!input.evidence) {
    return {
      dimension: input.dimension,
      rating: 'INSUFFICIENT_EVIDENCE',
      evidenceSummary: 'This interview did not produce an observable signal for this dimension.',
    };
  }
  const { aiAssessment, deterministicRating, deterministicSummary } = input.evidence;
  if (aiAssessment) {
    return { dimension: input.dimension, rating: aiAssessment.rating, evidenceSummary: aiAssessment.rationale };
  }
  if (deterministicRating) {
    return { dimension: input.dimension, rating: deterministicRating, evidenceSummary: deterministicSummary ?? '' };
  }
  // Evidence object was passed but empty — treat the same as "no evidence"
  // rather than guessing.
  return {
    dimension: input.dimension,
    rating: 'INSUFFICIENT_EVIDENCE',
    evidenceSummary: 'Evidence collection ran for this dimension but produced no usable signal.',
  };
}

export interface StructuredEvaluation {
  dimensionResults: DimensionResult[];
  strengths: string[];
  criticalGaps: string[];
  generatedBy: 'DETERMINISTIC' | 'AI_ASSISTED' | 'HYBRID';
}

/**
 * PHASE 24: no score-only evaluation. This produces the structured
 * breakdown the spec's own example shows (per-dimension ratings, not a
 * single averaged number).
 */
export function buildEvaluation(dimensionResults: DimensionResult[], usedAI: boolean): StructuredEvaluation {
  return {
    dimensionResults,
    strengths: dimensionResults.filter(d => d.rating === 'STRONG').map(d => `${d.dimension}: ${d.evidenceSummary}`),
    criticalGaps: dimensionResults.filter(d => d.rating === 'WEAK').map(d => `${d.dimension}: ${d.evidenceSummary}`),
    generatedBy: usedAI ? 'HYBRID' : 'DETERMINISTIC',
  };
}

/**
 * The dimensions PHASE 64's demonstration scenario treats as load-bearing
 * for a "Software Engineer" readiness call. Adjust per-blueprint if
 * different roles should weight different dimensions — this is
 * intentionally a simple, auditable list rather than a numeric weighting
 * scheme, so "why did readiness change" (PHASE 55) always has a plain-
 * English answer.
 */
const REQUIRED_FOR_READY: EvaluationDimension[] = [
  'CODING_CORRECTNESS', 'TIME_COMPLEXITY', 'SPACE_COMPLEXITY', 'DEBUGGING',
];

export interface ReadinessContribution {
  readinessLabel: ReadinessLabel;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
}

/**
 * PHASE 51: strong practice-mode history must never auto-produce READY when
 * this interview's own reasoning was weak — so this function looks ONLY at
 * this interview's dimension results, never at outside mastery data. That's
 * deliberate: cross-assessment aggregation is your EXISTING readiness
 * engine's job (PHASE 25), not this engine's. This is a *contribution*, not
 * a competing readiness computation.
 */
export function computeInterviewReadinessContribution(evaluation: StructuredEvaluation): ReadinessContribution {
  const byDimension = new Map(evaluation.dimensionResults.map(d => [d.dimension, d.rating]));
  const requiredRatings = REQUIRED_FOR_READY.map(d => byDimension.get(d));

  if (requiredRatings.every(r => r === undefined)) {
    return {
      readinessLabel: 'INSUFFICIENT_EVIDENCE',
      confidence: 'LOW',
      reason: 'None of the core required dimensions produced evidence in this interview.',
    };
  }

  const weakOnes = REQUIRED_FOR_READY.filter(d => byDimension.get(d) === 'WEAK');
  if (weakOnes.length > 0) {
    return {
      readinessLabel: 'NOT_READY',
      confidence: 'HIGH',
      reason: `Core dimension(s) rated WEAK: ${weakOnes.join(', ')}.`,
    };
  }

  const developingOnes = REQUIRED_FOR_READY.filter(d => {
    const r = byDimension.get(d);
    return r === 'DEVELOPING' || r === 'INSUFFICIENT_EVIDENCE';
  });
  if (developingOnes.length > 0) {
    return {
      readinessLabel: 'APPROACHING_READY',
      confidence: developingOnes.some(d => byDimension.get(d) === 'INSUFFICIENT_EVIDENCE') ? 'LOW' : 'MEDIUM',
      reason: `Implementation performance is strong, but ${developingOnes.join(', ')} needs additional evidence.`,
    };
  }

  return {
    readinessLabel: 'READY',
    confidence: 'HIGH',
    reason: 'All core dimensions (coding correctness, complexity reasoning, debugging) rated STRONG or COMPETENT.',
  };
}
