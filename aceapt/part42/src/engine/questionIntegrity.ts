import type { QuestionDifficulty } from "../types/domain.js";

export interface QuestionIntegritySignal {
  questionId: string;
  flagged: boolean;
  reason?: string;
}

/**
 * Module 35's checks ("unusually high failure", "suspicious answer
 * distribution") are inherently population-level — they need many
 * students' responses to the SAME question to mean anything. A single
 * diagnostic session has no such view. This is therefore written as a
 * batch utility meant to run periodically over aggregate response data
 * (e.g. a nightly job, or TPO-side tooling), NOT called per-response from
 * the live session path. See TRUTH_TABLE.md — this is real, working logic,
 * just not wired into a scheduler in this delivery.
 */
export function evaluateQuestionIntegrity(
  questionId: string,
  populationResponses: { isCorrect: boolean }[],
  expectedAccuracyForDifficulty: number, // e.g. a calibrated baseline for that difficulty band
  minSampleSize = 20,
): QuestionIntegritySignal {
  if (populationResponses.length < minSampleSize) {
    return { questionId, flagged: false, reason: "insufficient population sample to evaluate" };
  }

  const observedAccuracy = populationResponses.filter((r) => r.isCorrect).length / populationResponses.length;
  const deviation = Math.abs(observedAccuracy - expectedAccuracyForDifficulty);

  if (deviation >= 0.4) {
    return {
      questionId,
      flagged: true,
      reason: `observed accuracy (${(observedAccuracy * 100).toFixed(0)}%) deviates sharply from the expected baseline for this difficulty (${(expectedAccuracyForDifficulty * 100).toFixed(0)}%) — review the question for ambiguity, a wrong answer key, or miscalibrated difficulty`,
    };
  }

  return { questionId, flagged: false };
}

/** A same-response check this build CAN ground live: implausible timing on a single attempt. */
export function isSuspiciousSingleResponse(durationMs: number, expectedDurationMs: number, _difficulty: QuestionDifficulty): boolean {
  return expectedDurationMs > 0 && durationMs < Math.min(1500, expectedDurationMs * 0.1);
}
