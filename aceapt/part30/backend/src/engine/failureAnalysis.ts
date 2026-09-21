import type { EvidenceResult, StudentCapabilityState } from "../domain/types.js";

export type FailureCause =
  | "CONCEPTUAL_WEAKNESS"
  | "APPLICATION_WEAKNESS"
  | "TRANSFER_WEAKNESS"
  | "SPEED_ISSUE"
  | "CONSISTENCY_ISSUE"
  | "RETENTION_ISSUE"
  | "INSUFFICIENT_EVIDENCE";

export interface FailureDiagnosis {
  cause: FailureCause;
  explanation: string;
}

/**
 * Section 14: FAILURE-AWARE PATH. Never "try again" -- always a specific,
 * evidence-grounded read of what actually went wrong for this one attempt.
 * `priorState` is the capability state *before* this event was folded in,
 * so "was this a drop from where they were" is answerable.
 */
export function diagnoseFailure(
  result: EvidenceResult,
  priorState: StudentCapabilityState | null
): FailureDiagnosis {
  const accuracyThisAttempt =
    result.total && result.total > 0 ? (100 * (result.correct ?? 0)) / result.total : null;

  if (!priorState || priorState.evidenceCount < 2) {
    return {
      cause: "INSUFFICIENT_EVIDENCE",
      explanation: "This is one of the first attempts recorded for this capability -- not enough history yet to tell whether this was a one-off or a pattern.",
    };
  }

  const overTime =
    result.timeAllowedSeconds != null && result.timeTakenSeconds != null
      ? result.timeTakenSeconds > result.timeAllowedSeconds * 1.15
      : false;

  if (result.contextNovelty === "NOVEL" && accuracyThisAttempt != null && accuracyThisAttempt < 60 && priorState.accuracy >= 65) {
    return {
      cause: "TRANSFER_WEAKNESS",
      explanation: `Conceptual accuracy on familiar problems is already ${priorState.accuracy.toFixed(0)}. This attempt was a novel-context problem and accuracy dropped to ${accuracyThisAttempt.toFixed(0)} -- the concept isn't transferring to unfamiliar framings yet.`,
    };
  }

  if (overTime && accuracyThisAttempt != null && accuracyThisAttempt >= 60) {
    return {
      cause: "SPEED_ISSUE",
      explanation: `Accuracy on this attempt was ${accuracyThisAttempt.toFixed(0)}, but it took longer than the time allowed -- the understanding is there, timed application under pressure is not yet.`,
    };
  }

  // A meaningful drop only reads as "retention loss" if the prior level was
  // actually established (not just "better than this one attempt") --
  // otherwise a mediocre student having a bad attempt gets mischaracterized
  // as someone who is forgetting something they once had solid, when the
  // more honest read is that the concept was never solid to begin with.
  if (accuracyThisAttempt != null && priorState.accuracy >= 65 && priorState.accuracy - accuracyThisAttempt >= 25) {
    return {
      cause: "RETENTION_ISSUE",
      explanation: `Accuracy has typically run around ${priorState.accuracy.toFixed(0)} on this capability; this attempt came in at ${accuracyThisAttempt.toFixed(0)}, a meaningful drop from the established pattern.`,
    };
  }

  if (priorState.consistency < 50) {
    return {
      cause: "CONSISTENCY_ISSUE",
      explanation: `Results on this capability have been swinging attempt to attempt (consistency ${priorState.consistency.toFixed(0)}) -- this failure is in line with that pattern rather than a new problem.`,
    };
  }

  if (accuracyThisAttempt != null && accuracyThisAttempt < 40) {
    return {
      cause: "CONCEPTUAL_WEAKNESS",
      explanation: `Accuracy of ${accuracyThisAttempt.toFixed(0)} on a familiar-context problem points to a gap in the underlying concept, not just its application.`,
    };
  }

  return {
    cause: "APPLICATION_WEAKNESS",
    explanation: "The underlying concept is not the issue -- this reads as difficulty applying it under the specific conditions of this attempt.",
  };
}
