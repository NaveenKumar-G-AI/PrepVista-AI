import { createHash } from "node:crypto";
import type { NormalizedExecutionResult, FinalizationOutcome } from "../types/normalized.js";
import { classifyVerdict } from "../classification/classifyVerdict.js";

/**
 * Deterministic content hash over the facts that define a result's
 * identity: the exact version binding it was produced against, plus the
 * verdict and score. Two finalizations of the same submission against the
 * same versions should always hash identically; a re-evaluation against
 * different versions will legitimately hash differently — that's the
 * point (see VERSION TRACEABILITY).
 */
function computeResultHash(result: NormalizedExecutionResult, verdict: string): string {
  const material = JSON.stringify({
    submissionId: result.submissionId,
    evaluationId: result.evaluationId,
    versionBinding: result.versionBinding,
    verdict,
    score: result.scoring.score,
    maxScore: result.scoring.maxScore,
    testAggregate: result.testAggregate,
  });
  return createHash("sha256").update(material).digest("hex");
}

/**
 * Finalize a normalized execution result into the authoritative,
 * immutable FinalizedExecutionResult.
 *
 * Refuses to finalize (returns an UnfinalizedResult instead) when:
 *  - the required evaluation count has not been reached
 *  - the previously-finalized record for this evaluationId is already immutable
 *
 * Callers are responsible for persisting the outcome inside a transaction
 * (see src/persistence) so that "aggregation succeeded" and "persisted
 * successfully" happen atomically.
 */
export function finalizeResult(
  result: NormalizedExecutionResult,
  opts: { alreadyFinalized?: boolean } = {},
): FinalizationOutcome {
  if (opts.alreadyFinalized) {
    return {
      kind: "NOT_FINALIZED",
      submissionId: result.submissionId,
      evaluationId: result.evaluationId,
      reason: "ALREADY_FINALIZED_IMMUTABLE",
      detail: `Evaluation ${result.evaluationId} already has an immutable finalized result. Use re-evaluation to correct it.`,
    };
  }

  if (!result.completeness.isComplete) {
    return {
      kind: "NOT_FINALIZED",
      submissionId: result.submissionId,
      evaluationId: result.evaluationId,
      reason: "EVALUATION_INCOMPLETE",
      detail: `Only ${result.completeness.completed}/${result.completeness.required} required evaluations completed. Result cannot be finalized as a normal outcome.`,
    };
  }

  const classification = classifyVerdict(result);
  const resultHash = computeResultHash(result, classification.verdict);

  return {
    kind: "FINALIZED",
    submissionId: result.submissionId,
    evaluationId: result.evaluationId,
    verdict: classification.verdict,
    origin: classification.origin,
    result,
    finalizedAtIso: new Date().toISOString(),
    resultHash,
  };
}
