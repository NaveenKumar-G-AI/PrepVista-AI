import type { StepResult, StepTemplate } from '../problemBank/types.js';

export type StepClassification =
  | 'CORRECT'
  | 'FIRST_ERROR'
  | 'AFFECTED_BY_PRIOR_ERROR'
  | 'INDEPENDENT_ERROR'
  | 'SKIPPED'
  | 'PENDING';

export interface StepJudgement {
  stepId: string;
  rawResult: StepResult | 'PENDING';
  classification: StepClassification;
}

export interface RecordedAttempt {
  result: StepResult;
  /** Best-effort numeric reading of the student's latest attempt for this step, if any. */
  numericValue: number | null;
  /** For STRUCTURED_FIELD_SET steps: individual field values, e.g. { distance: 380, speed: 60 }. */
  structuredValues?: Record<string, number>;
  skipped?: boolean;
}

/**
 * Implements Sections 18-19 exactly:
 *
 *  - The FIRST step that is not CORRECT is the "first meaningful error."
 *  - Every step *after* that is checked against what it would have to equal
 *    if we charitably carried the student's own (possibly wrong) earlier
 *    numbers forward. If the student's later step is internally consistent
 *    with their own earlier mistake, it is AFFECTED_BY_PRIOR_ERROR, not a
 *    second independent conceptual mistake.
 *  - A later step that is wrong in a way that does NOT follow from the
 *    earlier mistake is a genuinely new, INDEPENDENT_ERROR.
 *
 * This is what lets the UI show "Step 3 is the real problem; Step 4 just
 * carried it forward" instead of making the whole solution look wrong
 * (Section 51).
 */
export function classifySteps(
  steps: StepTemplate[],
  attemptsByStepId: Record<string, RecordedAttempt | undefined>,
): StepJudgement[] {
  const judgements: StepJudgement[] = [];
  const priorNumericValues: Record<string, number> = {};
  let firstErrorSeen = false;

  for (const step of steps) {
    const attempt = attemptsByStepId[step.stepId];

    if (!attempt) {
      judgements.push({ stepId: step.stepId, rawResult: 'PENDING', classification: 'PENDING' });
      continue;
    }

    if (attempt.numericValue !== null) {
      priorNumericValues[step.stepId] = attempt.numericValue;
    }
    if (attempt.structuredValues) {
      for (const [fieldKey, value] of Object.entries(attempt.structuredValues)) {
        priorNumericValues[`${step.stepId}.${fieldKey}`] = value;
      }
    }

    if (attempt.skipped) {
      judgements.push({ stepId: step.stepId, rawResult: attempt.result, classification: 'SKIPPED' });
      // A skipped step still breaks the independent-success chain, but it is
      // deliberately NOT treated as an error to attribute downstream work to
      // (Section 75: skipping is never mastery, but it is also not a mistake).
      continue;
    }

    if (attempt.result === 'CORRECT') {
      judgements.push({ stepId: step.stepId, rawResult: attempt.result, classification: 'CORRECT' });
      continue;
    }

    if (!firstErrorSeen) {
      firstErrorSeen = true;
      judgements.push({ stepId: step.stepId, rawResult: attempt.result, classification: 'FIRST_ERROR' });
      continue;
    }

    if (step.deriveExpectedGivenPriorAttempts && attempt.numericValue !== null) {
      const charitableExpected = step.deriveExpectedGivenPriorAttempts(priorNumericValues);
      if (charitableExpected !== null) {
        const tolerance = 1e-6 * Math.max(1, Math.abs(charitableExpected));
        if (Math.abs(charitableExpected - attempt.numericValue) <= tolerance) {
          judgements.push({ stepId: step.stepId, rawResult: attempt.result, classification: 'AFFECTED_BY_PRIOR_ERROR' });
          continue;
        }
      }
    }

    judgements.push({ stepId: step.stepId, rawResult: attempt.result, classification: 'INDEPENDENT_ERROR' });
  }

  return judgements;
}

export function findFirstErrorStepId(judgements: StepJudgement[]): string | null {
  return judgements.find((j) => j.classification === 'FIRST_ERROR')?.stepId ?? null;
}
