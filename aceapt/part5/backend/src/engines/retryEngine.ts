import { ErrorCategory, RetryType } from "../domain/enums";

export interface RetryDecision {
  type: RetryType;
  rationale: string;
}

/**
 * §23 — never "retry the same failed question forever." `sameQuestionRetryCount`
 * is how many times THIS question has already been retried in this session.
 */
export function decideRetry(params: {
  errorCategory: ErrorCategory | null;
  hintsUsedOnLastAttempt: number;
  sameQuestionRetryCount: number;
}): RetryDecision {
  const { errorCategory, hintsUsedOnLastAttempt, sameQuestionRetryCount } = params;

  if (sameQuestionRetryCount >= 1) {
    // Already retried this exact question once — move on rather than looping.
    return {
      type: RetryType.SIMILAR_QUESTION,
      rationale: "Already retried this exact question once — moving to a similar question with a fresh structure instead of repeating it again.",
    };
  }

  if (errorCategory === ErrorCategory.CARELESS_ERROR || errorCategory === ErrorCategory.MISREAD) {
    return {
      type: RetryType.RETRY_SAME,
      rationale: "This looked like a slip, not a gap — worth another careful attempt at the same question.",
    };
  }

  if (errorCategory === ErrorCategory.CONCEPT_GAP || errorCategory === ErrorCategory.PARTIAL_UNDERSTANDING) {
    return {
      type: RetryType.EASIER_REMEDIATION,
      rationale: "This points to a gap in the underlying idea — stepping to an easier question on the same concept before returning here.",
    };
  }

  if (hintsUsedOnLastAttempt === 0) {
    return {
      type: RetryType.RETRY_WITH_HINT,
      rationale: "No hints used yet — offering a hint before moving on.",
    };
  }

  return {
    type: RetryType.REATTEMPT_AFTER_EXPLANATION,
    rationale: "The explanation should clear this up — try a fresh question on the same skill next.",
  };
}
