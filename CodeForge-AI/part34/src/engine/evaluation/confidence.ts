// ============================================================================
// Phase 24 — "Confidence must be independent of performance... Do not assign
// arbitrary confidence values."
//
// Independent of performance means: a student who answers confidently
// wrong still produces LOW confidence (few/shallow questions, no prior
// evidence) exactly as often as a student who answers confidently right —
// confidence measures how much and how good the EVIDENCE-GATHERING was, not
// whether the answer was correct. Correctness lives in EvaluationDimensions;
// confidence lives here, and the two are computed from disjoint inputs.
// ============================================================================

import type { ConfidenceFactors } from "../../domain/types.js";

/**
 * Weights sum to 1.0. Each factor is independently documented so a reviewer
 * can see exactly why a confidence number is what it is — this is what
 * "explainable" means operationally, not just as an adjective.
 */
const WEIGHTS: Record<keyof ConfidenceFactors, number> = {
  responseQuality: 0.15, // clarity/completeness of the response as a signal artifact, NOT correctness
  questionDifficulty: 0.15, // harder questions that still produced usable evidence count more
  questionCount: 0.2, // more independent data points -> more confidence in the aggregate
  evidenceConsistency: 0.2, // repeated evidence agreeing with itself
  projectCodeAlignment: 0.15, // explanation matching real code, when code-grounded
  priorEvidenceWeight: 0.05, // small: pre-interview evidence contributes, but this interview should dominate
  followUpDepth: 0.1, // deeper follow-up chains that held up increase confidence
};

/** questionCount is a raw integer in ConfidenceFactors; normalize it here so the weighted sum stays in [0,1]. */
function normalizeQuestionCount(count: number): number {
  const CEILING = 5; // beyond ~5 independent questions on one skill, additional count adds little more confidence
  return Math.min(1, count / CEILING);
}

export function computeConfidence(factors: ConfidenceFactors): number {
  let score = 0;
  score += WEIGHTS.responseQuality * clamp01(factors.responseQuality);
  score += WEIGHTS.questionDifficulty * clamp01(factors.questionDifficulty);
  score += WEIGHTS.questionCount * normalizeQuestionCount(factors.questionCount);
  score += WEIGHTS.evidenceConsistency * clamp01(factors.evidenceConsistency);
  score += WEIGHTS.projectCodeAlignment * (factors.projectCodeAlignment === null ? 0.5 : clamp01(factors.projectCodeAlignment));
  score += WEIGHTS.priorEvidenceWeight * clamp01(factors.priorEvidenceWeight);
  score += WEIGHTS.followUpDepth * clamp01(factors.followUpDepth);
  return round2(clamp01(score));
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
