import type { DiagnosticEvidence, QualityFlag, RawResponseInput } from "../types/domain.js";
import { classifyTiming, durationRatio, isImplausiblyFast } from "./timingIntelligence.js";

export interface EvidenceQualityInput {
  response: RawResponseInput;
  /** How many times this exact question was answered by this student BEFORE this attempt. 0 = fresh. */
  priorExposureCount: number;
}

const VERY_SLOW_RATIO = 4.0;

/**
 * Module 10: turns one raw response into weighted, flagged evidence.
 * Every discount here traces to a specific rule from the spec — nothing is
 * an arbitrary tuning knob dressed up as insight.
 */
export function computeEvidence({ response, priorExposureCount }: EvidenceQualityInput): DiagnosticEvidence {
  const flags: QualityFlag[] = [];

  if (response.isCorrect === null) {
    return {
      skillNodeId: response.skillNodeId,
      isCorrect: null,
      evidenceWeight: 0,
      timingClassification: "skipped",
      qualityFlags: ["skipped_question"],
      confidence: response.confidence,
    };
  }

  const timingClassification = classifyTiming(response.durationMs, response.expectedDurationMs, response.isCorrect);
  let weight = 1.0;

  if (response.hintUsed) {
    weight *= 0.3;
    flags.push("hint_assisted");
  }

  if (priorExposureCount > 0) {
    weight *= 1 / (1 + priorExposureCount);
    flags.push("repeated_exposure");
  }

  if (isImplausiblyFast(response.durationMs, response.expectedDurationMs)) {
    weight *= 0.2;
    flags.push("abnormal_timing_too_fast");
  } else if (durationRatio(response.durationMs, response.expectedDurationMs) > VERY_SLOW_RATIO) {
    weight *= 0.7; // still real evidence, just noisier — could be an interruption
    flags.push("abnormal_timing_too_slow");
  }

  if (response.isCorrect && response.confidence === 1) {
    weight *= 0.85; // correct + "guessing" self-rating is weaker evidence of mastery
    flags.push("low_confidence_correct");
  }

  if (!response.isCorrect && response.confidence === 5) {
    // Not a weight discount — a wrong answer is a wrong answer either way —
    // but a real signal for confidence-calibration analysis (see confidence.ts).
    flags.push("high_confidence_wrong");
  }

  return {
    skillNodeId: response.skillNodeId,
    isCorrect: response.isCorrect,
    evidenceWeight: Math.max(0, Math.min(1, weight)),
    timingClassification,
    qualityFlags: flags,
    confidence: response.confidence,
  };
}
