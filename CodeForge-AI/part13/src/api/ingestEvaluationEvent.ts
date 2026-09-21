import { normalizeExecutionEvidence } from "../normalization/normalize.js";
import { finalizeResult } from "../finalize/finalizeResult.js";
import type { ExecutionResultRepository } from "../persistence/repository.js";
import { DuplicateFinalizationError } from "../persistence/repository.js";
import type { LifecycleEvent } from "../types/normalized.js";
import type { EvaluationLifecycleState } from "../types/enums.js";
import { applyLifecycleEvent, type EvaluationTrackedState } from "../state/eventGuard.js";

export interface IngestEvaluationEventInput {
  lifecycleEvent: LifecycleEvent;
  /** Present only on COMPLETED events — the raw executor payload to normalize + finalize. */
  rawEvidence: unknown | null;
  ownerUserId: string;
  cohortId: string | null;
}

export type IngestOutcome =
  | { kind: "LIFECYCLE_UPDATED"; state: EvaluationLifecycleState }
  | { kind: "IGNORED_STALE_OR_DUPLICATE"; reasonCode: string; detail: string }
  | { kind: "FINALIZED"; verdict: string }
  | { kind: "NOT_FINALIZED"; reason: string; detail: string }
  | { kind: "NORMALIZATION_REJECTED"; reason: string; detail: string; issues?: string[] }
  | { kind: "DUPLICATE_FINALIZATION_PREVENTED"; evaluationId: string };

/**
 * Single entry point for events arriving from the existing execution
 * engine / queue. Designed to be safe under: out-of-order delivery,
 * duplicate delivery, worker crashes and retries (idempotent via the
 * evaluationId unique constraint at the repository layer), and malformed
 * evaluator payloads (rejected via normalization, never crashing the
 * pipeline).
 *
 * `trackedStateLookup`/`trackedStateSave` let the caller plug in whatever
 * durable store already exists for lifecycle state (e.g. a row in
 * execution_evaluations) — this module stays storage-agnostic.
 */
export async function ingestEvaluationEvent(
  input: IngestEvaluationEventInput,
  repo: ExecutionResultRepository,
  trackedStateLookup: (evaluationId: string) => Promise<EvaluationTrackedState | null>,
  trackedStateSave: (state: EvaluationTrackedState) => Promise<void>,
): Promise<IngestOutcome> {
  const { lifecycleEvent } = input;

  const priorState = await trackedStateLookup(lifecycleEvent.evaluationId);
  const { state: nextState, decision } = applyLifecycleEvent(priorState, lifecycleEvent);
  await trackedStateSave(nextState);

  if (!decision.accept) {
    return { kind: "IGNORED_STALE_OR_DUPLICATE", reasonCode: decision.reasonCode, detail: decision.detail };
  }

  if (lifecycleEvent.state !== "COMPLETED") {
    return { kind: "LIFECYCLE_UPDATED", state: lifecycleEvent.state };
  }

  // COMPLETED: normalize + finalize + persist.
  if (input.rawEvidence === null) {
    return {
      kind: "NORMALIZATION_REJECTED",
      reason: "MISSING_EVIDENCE",
      detail: "Lifecycle event reported COMPLETED but no raw evidence payload was attached.",
    };
  }

  const normalization = normalizeExecutionEvidence(input.rawEvidence);
  if (!normalization.ok) {
    return normalization.issues
      ? {
          kind: "NORMALIZATION_REJECTED",
          reason: normalization.reason,
          detail: normalization.detail,
          issues: normalization.issues,
        }
      : {
          kind: "NORMALIZATION_REJECTED",
          reason: normalization.reason,
          detail: normalization.detail,
        };
  }

  const finalization = finalizeResult(normalization.result);
  if (finalization.kind === "NOT_FINALIZED") {
    return { kind: "NOT_FINALIZED", reason: finalization.reason, detail: finalization.detail };
  }

  try {
    await repo.insertFinalizedResult(finalization, input.ownerUserId, input.cohortId);
  } catch (err) {
    if (err instanceof DuplicateFinalizationError) {
      // Two workers raced to finalize the same evaluation; the first write
      // wins and this is treated as a safe no-op, not a crash.
      return { kind: "DUPLICATE_FINALIZATION_PREVENTED", evaluationId: finalization.evaluationId };
    }
    throw err;
  }

  return { kind: "FINALIZED", verdict: finalization.verdict };
}
