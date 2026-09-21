import type { ConfidenceInputs, ConfidenceResult } from "../domain/types.js";

// Weights sum to 1.0. Chosen so that sample size and how "realistic" the
// evidence source is dominate — a pile of easy topic-practice attempts
// should never buy the same confidence as a handful of full simulations
// (Section 3: assessment similarity is one of the named inputs precisely to
// prevent that).
const WEIGHTS = {
  sampleSize: 0.25,
  recency: 0.15,
  consistency: 0.15,
  assessmentSimilarity: 0.2,
  novelty: 0.1,
  topicCoverage: 0.1,
  difficultyCoverage: 0.05,
} as const;

function sampleSizeFactor(n: number): number {
  // 0 -> 0, 1 -> 0.2, 3 -> 0.6, 5+ -> 1.0 (diminishing, not linear-forever)
  return Math.max(0, Math.min(1, n / 5));
}

function recencyFactor(days: number | null): number {
  if (days === null) return 0;
  if (days <= 14) return 1;
  if (days <= 30) return 0.7;
  if (days <= 60) return 0.4;
  return 0.15;
}

function consistencyFactor(consistency: number | null): number {
  // Null means "not enough data points to even measure variance" — that is
  // itself a reason for lower confidence, not a neutral unknown.
  if (consistency === null) return 0.3;
  return Math.max(0, Math.min(1, consistency));
}

export function computeConfidence(inputs: ConfidenceInputs): ConfidenceResult {
  const factors = {
    sampleSize: sampleSizeFactor(inputs.sampleSize),
    recency: recencyFactor(inputs.recencyDays),
    consistency: consistencyFactor(inputs.consistency),
    assessmentSimilarity: Math.max(0, Math.min(1, inputs.assessmentSimilarity)),
    novelty: Math.max(0, Math.min(1, inputs.novelty)),
    topicCoverage: Math.max(0, Math.min(1, inputs.topicCoverage)),
    difficultyCoverage: Math.max(0, Math.min(1, inputs.difficultyCoverage)),
  };

  let score = 0;
  for (const key of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
    score += WEIGHTS[key] * factors[key];
  }
  score = Math.round(score * 1000) / 1000;

  const level = score >= 0.7 ? "HIGH" : score >= 0.4 ? "MEDIUM" : "LOW";

  const limitingFactors: string[] = [];
  if (factors.sampleSize < 0.6) {
    limitingFactors.push(
      inputs.sampleSize <= 1
        ? `Only ${inputs.sampleSize} simulation${inputs.sampleSize === 1 ? "" : "s"} available as evidence.`
        : `Only ${inputs.sampleSize} simulations available — confidence grows with more.`
    );
  }
  if (factors.recency < 0.7) {
    limitingFactors.push(
      inputs.recencyDays === null ? "No recent evidence available." : `Most recent evidence is ${inputs.recencyDays} days old.`
    );
  }
  if (factors.consistency < 0.5) {
    limitingFactors.push(
      inputs.consistency === null
        ? "Not enough simulations to measure consistency yet."
        : "Performance varies notably between simulations."
    );
  }
  if (factors.assessmentSimilarity < 0.6) {
    limitingFactors.push("Evidence leans on lower-pressure practice modes rather than full realistic simulations.");
  }
  if (factors.novelty < 0.5) {
    limitingFactors.push("A meaningful share of questions were previously seen, not novel.");
  }
  if (factors.topicCoverage < 0.6) {
    limitingFactors.push("Evidence does not yet cover all target topics.");
  }
  if (factors.difficultyCoverage < 0.6) {
    limitingFactors.push("Evidence does not yet cover the full difficulty range.");
  }

  return { level, score, limitingFactors };
}
