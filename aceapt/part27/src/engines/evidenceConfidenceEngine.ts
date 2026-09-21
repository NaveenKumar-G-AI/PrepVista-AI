/**
 * Turns evidence *quality* (not just quantity) into a confidence level the
 * forecast/UI can show honestly (spec section 15 & 18). 100 identical easy
 * questions should not read as confidently as a smaller, more varied set —
 * this is where that distinction lives.
 *
 * Weights are named constants (tunable), and sum to 1.0. A hard floor forces
 * INSUFFICIENT below a minimum observation count regardless of how the other
 * factors look, matching the spec's "Forecast unavailable — more evidence
 * required" behavior for genuinely sparse data.
 */
import type { ConfidenceLevel, EvidenceConfidenceResult, EvidenceQualityInput } from "../domain/types.js";
import { clamp } from "../utils/format.js";

const MIN_OBSERVATIONS_FLOOR = 3;
const FULL_CREDIT_OBSERVATION_COUNT = 20; // diminishing returns above this
const RECENCY_STALE_AFTER_DAYS = 30;

const WEIGHTS = {
  count: 0.25,
  recency: 0.15,
  topicDiversity: 0.15,
  difficultyDiversity: 0.15,
  novelty: 0.1,
  evidenceTypes: 0.1,
  stability: 0.1,
};

const HIGH_THRESHOLD = 0.7;
const MEDIUM_THRESHOLD = 0.45;
const LOW_THRESHOLD = 0.2;

export function computeConfidence(input: EvidenceQualityInput): EvidenceConfidenceResult {
  const countScore = clamp(input.observationCount / FULL_CREDIT_OBSERVATION_COUNT, 0, 1);
  const recencyScore = clamp(1 - input.recencyDaysAvg / RECENCY_STALE_AFTER_DAYS, 0, 1);
  const evidenceTypesScore =
    [input.hasTransferEvidence, input.hasAssessmentEvidence, input.hasTimedEvidence].filter(Boolean).length / 3;

  const rawScore =
    WEIGHTS.count * countScore +
    WEIGHTS.recency * recencyScore +
    WEIGHTS.topicDiversity * clamp(input.topicDiversity, 0, 1) +
    WEIGHTS.difficultyDiversity * clamp(input.difficultyDiversity, 0, 1) +
    WEIGHTS.novelty * clamp(input.noveltyRatio, 0, 1) +
    WEIGHTS.evidenceTypes * evidenceTypesScore +
    WEIGHTS.stability * clamp(input.historicalStability, 0, 1);

  const score = clamp(rawScore, 0, 1);
  const insufficientByCount = input.observationCount < MIN_OBSERVATIONS_FLOOR;

  let level: ConfidenceLevel;
  if (insufficientByCount || score < LOW_THRESHOLD) level = "INSUFFICIENT";
  else if (score < MEDIUM_THRESHOLD) level = "LOW";
  else if (score < HIGH_THRESHOLD) level = "MEDIUM";
  else level = "HIGH";

  const reasons: string[] = [];
  if (input.breakdown) {
    const parts: string[] = [];
    if (input.breakdown.assessments > 0) parts.push(`${input.breakdown.assessments} recent assessments`);
    if (input.breakdown.adaptiveSessions > 0) parts.push(`${input.breakdown.adaptiveSessions} adaptive sessions`);
    if (input.breakdown.practiceQuestions > 0) parts.push(`${input.breakdown.practiceQuestions} practice items`);
    if (parts.length > 0) {
      reasons.push(`Based on ${listJoin(parts)}${input.difficultyDiversity > 0.5 ? ", with mixed-difficulty evidence" : ""}.`);
    }
  } else {
    reasons.push(`Based on ${input.observationCount} observations.`);
  }
  if (insufficientByCount) {
    reasons.push("Not enough observations yet for a confident forecast — more evidence is needed.");
  }
  if (!insufficientByCount && recencyScore < 0.4) {
    reasons.push("Recent evidence is limited; the forecast may shift as new observations come in.");
  }
  if (input.hasTransferEvidence) reasons.push("Includes transfer (novel-context) evidence.");
  if (input.hasTimedEvidence) reasons.push("Includes timed-assessment evidence.");

  return { level, score, reasons };
}

function listJoin(parts: string[]): string {
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}
