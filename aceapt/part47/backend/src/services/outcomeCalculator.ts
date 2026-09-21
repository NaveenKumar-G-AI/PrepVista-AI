import type { GuidedAssistanceRecord, GuidedAttemptRecord, GuidedStepStateRecord } from '../repositories/records.js';
import { computeGuidanceDependency, type GuidanceDependency } from '../domain/engine/fading.js';

export interface OutcomeStats {
  stepsTotal: number;
  stepsIndependent: number;
  stepsAssisted: number;
  stepsSkipped: number;
  hintsUsed: number;
  retries: number;
  guidanceDependency: GuidanceDependency;
}

/**
 * Derives the richer-than-"question correct" statistics from Section 45,
 * from nothing but the persisted step states, assistance events, and
 * attempts for one session. Pure and dependency-free on purpose - this is
 * exactly the kind of function that should never need a database or an AI
 * call to test.
 */
export function computeOutcomeStats(
  stepStates: GuidedStepStateRecord[],
  assistanceEvents: GuidedAssistanceRecord[],
  attempts: GuidedAttemptRecord[],
): OutcomeStats {
  const stepsTotal = stepStates.length;
  const stepsSkipped = stepStates.filter((s) => s.status === 'SKIPPED').length;
  const stepsIndependent = stepStates.filter((s) => s.status === 'CORRECT' && s.independent).length;
  const stepsAssisted = Math.max(stepsTotal - stepsIndependent - stepsSkipped, 0);

  const hintsUsed = assistanceEvents.filter((a) => a.type === 'HINT').length;

  const attemptsByStepState = new Map<string, number>();
  for (const attempt of attempts) {
    attemptsByStepState.set(attempt.stepStateId, (attemptsByStepState.get(attempt.stepStateId) ?? 0) + 1);
  }
  let retries = 0;
  for (const count of attemptsByStepState.values()) {
    retries += Math.max(count - 1, 0);
  }

  return {
    stepsTotal,
    stepsIndependent,
    stepsAssisted,
    stepsSkipped,
    hintsUsed,
    retries,
    guidanceDependency: computeGuidanceDependency({ stepsTotal, hintsUsed, retries }),
  };
}

/** Section 20-21: did the step where the first error occurred go on to recover WITH guidance? */
export function computeRecoverySuccess(firstErrorStepId: string | null, stepStates: GuidedStepStateRecord[]): boolean {
  if (!firstErrorStepId) return false;
  const step = stepStates.find((s) => s.stepId === firstErrorStepId);
  return Boolean(step && step.status === 'CORRECT' && step.recoveredWithGuidance);
}
