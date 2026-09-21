/**
 * Scoring Engine.
 *
 * Every constant here is documented with WHY, and every function is unit
 * tested against concrete inputs/outputs (tests/engines.test.ts) — per the
 * spec's explicit requirement: "Do not use arbitrary weighting without
 * documenting and testing the scoring model."
 */
import type {
  DimensionProfile,
  DimensionStatus,
  EvidenceItem,
  EvidenceStrengthLabel,
  ProbeType,
  UnderstandingDimension,
} from "@/types/index.js";

/**
 * Base reliability weight per probe type, on a 0-1 scale. Derived directly
 * from the spec's evidence-weighting tiers:
 *
 *   Strong (>=0.85): "successful transfer, successful modification,
 *     successful debugging, correct execution prediction, correct state
 *     tracing" -> transfer, modification, debugging, prediction, state_trace
 *   Moderate (0.5-0.85): "causal explanation, invariant explanation,
 *     complexity derivation" -> causal_why, invariant, complexity (plus
 *     counterfactual/edge_case/alternative_approach, which test the same
 *     kind of causal/applied reasoning). Invariant sits at the top of this
 *     band per the spec's explicit note that invariant evidence "must
 *     receive significant weight".
 *   Weak (<0.5): "generic explanation, terminology, self-reported
 *     confidence" -> explanation (the free-form initial/unprompted kind).
 */
export const PROBE_TYPE_BASE_WEIGHT: Record<ProbeType, number> = {
  transfer: 1.0,
  modification: 0.95,
  debugging: 0.95,
  prediction: 0.9,
  state_trace: 0.88,
  invariant: 0.8,
  counterfactual: 0.7,
  causal_why: 0.65,
  complexity: 0.6,
  edge_case: 0.58,
  alternative_approach: 0.55,
  explanation: 0.3,
};

export function evidenceStrengthFromWeight(weight: number): EvidenceStrengthLabel {
  if (weight >= 0.8) return "strong";
  if (weight >= 0.5) return "moderate";
  return "weak";
}

/** How much of "full credit" each observed result is worth, 0-100. */
export const RESULT_SCORE_VALUE: Record<EvidenceItem["result"], number> = {
  correct: 100,
  partially_correct: 55,
  ambiguous: 30,
  incorrect: 5,
  no_response: 0,
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function weightedMean(values: number[], weights: number[]): number {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) return 0;
  const sum = values.reduce((acc, v, i) => acc + v * (weights[i] ?? 0), 0);
  return sum / totalWeight;
}

/**
 * Weighted-average score for a dimension. Each evidence item's contribution
 * is weighted by (probe reliability) x (the evaluator's own confidence in
 * that specific judgement) — a "correct" result the evaluator itself flagged
 * as low-confidence should move the score less than a high-confidence one.
 */
export function computeDimensionScore(items: EvidenceItem[]): number {
  if (items.length === 0) return 0;
  const values = items.map((i) => RESULT_SCORE_VALUE[i.result]);
  const weights = items.map((i) => PROBE_TYPE_BASE_WEIGHT[i.probe_type] * (i.confidence / 100));
  return Math.round(weightedMean(values, weights));
}

/**
 * Confidence in the dimension's score itself (NOT the score value). Depends
 * on amount, diversity, and reliability of evidence, per spec:
 * "Confidence should depend on the amount, diversity, and reliability of
 * evidence." Weights sum to 1.0 and are individually documented:
 *
 *   0.35 - amount:      saturates at 3 independent evidence items, since a
 *                        single probe should never alone yield high
 *                        confidence ("Never decide understanding from one
 *                        answer.")
 *   0.25 - diversity:    saturates at 2 distinct probe types, rewarding
 *                        cross-checking a concept from more than one angle
 *   0.20 - reliability:  average base weight of the probe types actually used
 *   0.20 - eval clarity: average evaluator confidence across items
 */
export function computeDimensionConfidence(items: EvidenceItem[]): number {
  if (items.length === 0) return 0;
  const distinctTypes = new Set(items.map((i) => i.probe_type)).size;
  const avgReliability = mean(items.map((i) => PROBE_TYPE_BASE_WEIGHT[i.probe_type]));
  const avgEvalConfidence = mean(items.map((i) => i.confidence)) / 100;
  const amountFactor = Math.min(1, items.length / 3);
  const diversityFactor = Math.min(1, distinctTypes / 2);

  const raw = amountFactor * 0.35 + diversityFactor * 0.25 + avgReliability * 0.2 + avgEvalConfidence * 0.2;
  return Math.round(raw * 100);
}

export function evidenceStrengthForDimension(items: EvidenceItem[]): EvidenceStrengthLabel {
  if (items.length === 0) return "weak";
  const avgReliability = mean(items.map((i) => PROBE_TYPE_BASE_WEIGHT[i.probe_type]));
  return evidenceStrengthFromWeight(avgReliability);
}

const INSUFFICIENT_EVIDENCE_CONFIDENCE_THRESHOLD = 35;
const STRONG_SCORE_THRESHOLD = 75;
const STRONG_CONFIDENCE_THRESHOLD = 60;
const DEMONSTRATED_SCORE_THRESHOLD = 55;
const DEVELOPING_SCORE_THRESHOLD = 35;

export function computeDimensionStatus(score: number, confidence: number, hasEvidence: boolean): DimensionStatus {
  if (!hasEvidence) return "not_assessed";
  if (confidence < INSUFFICIENT_EVIDENCE_CONFIDENCE_THRESHOLD) return "insufficient_evidence";
  if (score >= STRONG_SCORE_THRESHOLD && confidence >= STRONG_CONFIDENCE_THRESHOLD) return "strong";
  if (score >= DEMONSTRATED_SCORE_THRESHOLD) return "demonstrated";
  if (score >= DEVELOPING_SCORE_THRESHOLD) return "developing";
  return "gap_identified";
}

/** Deduplicated, human-readable gaps pulled from evidence that fell short of "correct". */
export function extractGaps(items: EvidenceItem[]): string[] {
  const gaps = items
    .filter((i) => i.result === "incorrect" || i.result === "partially_correct")
    .map((i) => i.observed_evidence)
    .filter((g): g is string => Boolean(g && g.trim().length > 0));
  return Array.from(new Set(gaps)).slice(0, 5);
}

export function buildDimensionProfile(dimension: UnderstandingDimension, items: EvidenceItem[]): DimensionProfile {
  const score = computeDimensionScore(items);
  const confidence = computeDimensionConfidence(items);
  return {
    dimension,
    score,
    confidence,
    evidence_strength: evidenceStrengthForDimension(items),
    status: computeDimensionStatus(score, confidence, items.length > 0),
    supporting_evidence: items.filter((i) => i.result === "correct" || i.result === "partially_correct").map((i) => i.id),
    identified_gaps: extractGaps(items),
  };
}

export { mean, weightedMean };
