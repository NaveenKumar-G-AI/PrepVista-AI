import { describe, it, expect } from 'vitest';
import { classifySteps, findFirstErrorStepId, type RecordedAttempt } from '../src/domain/engine/errorLocalization.js';
import type { StepTemplate } from '../src/domain/problemBank/types.js';
import { buildSpeedDistanceTimeProblem } from '../src/domain/problemBank/speedDistanceTime.js';

function makeStep(overrides: Partial<StepTemplate> & Pick<StepTemplate, 'stepId' | 'sequence'>): StepTemplate {
  return {
    type: 'CALCULATE',
    objective: 'test step',
    prompt: 'test prompt',
    skill: 'test-skill',
    expectedInputType: 'NUMERIC',
    validation: { type: 'NUMERIC_TOLERANCE', spec: { expected: 0 } },
    difficulty: 'EASY',
    hintLadder: [],
    explanation: 'test explanation',
    ...overrides,
  };
}

describe('classifySteps - Section 19 worked example (100 vs 120 carried forward)', () => {
  // Step A computes an intermediate quantity (correct answer: 100).
  // Step B divides that intermediate quantity by 2.
  // If the student got 120 at Step A, Step B "should" be 60 given THEIR OWN number,
  // not 50 (half of the true 100). Submitting 60 at Step B must be classified as
  // AFFECTED_BY_PRIOR_ERROR, not a second independent mistake.
  const steps: StepTemplate[] = [
    makeStep({ stepId: 'stepA', sequence: 1, validation: { type: 'NUMERIC_TOLERANCE', spec: { expected: 100 } } }),
    makeStep({
      stepId: 'stepB',
      sequence: 2,
      validation: { type: 'NUMERIC_TOLERANCE', spec: { expected: 50 } },
      deriveExpectedGivenPriorAttempts: (prior) => {
        const a = prior['stepA'];
        return a === undefined ? null : a / 2;
      },
    }),
  ];

  it('marks the first wrong step as FIRST_ERROR', () => {
    const attempts: Record<string, RecordedAttempt> = {
      stepA: { result: 'INCORRECT', numericValue: 120 },
      stepB: { result: 'INCORRECT', numericValue: 60 },
    };
    const judgements = classifySteps(steps, attempts);
    expect(judgements.find((j) => j.stepId === 'stepA')?.classification).toBe('FIRST_ERROR');
  });

  it('marks a downstream step that is consistent with the earlier mistake as AFFECTED_BY_PRIOR_ERROR', () => {
    const attempts: Record<string, RecordedAttempt> = {
      stepA: { result: 'INCORRECT', numericValue: 120 },
      stepB: { result: 'INCORRECT', numericValue: 60 }, // 120 / 2, exactly what a charitable read expects
    };
    const judgements = classifySteps(steps, attempts);
    expect(judgements.find((j) => j.stepId === 'stepB')?.classification).toBe('AFFECTED_BY_PRIOR_ERROR');
  });

  it('marks a downstream step that does NOT follow from the earlier mistake as INDEPENDENT_ERROR', () => {
    const attempts: Record<string, RecordedAttempt> = {
      stepA: { result: 'INCORRECT', numericValue: 120 },
      stepB: { result: 'INCORRECT', numericValue: 999 }, // not consistent with 120 / 2 = 60
    };
    const judgements = classifySteps(steps, attempts);
    expect(judgements.find((j) => j.stepId === 'stepB')?.classification).toBe('INDEPENDENT_ERROR');
  });

  it('marks every step CORRECT when the student gets everything right', () => {
    const attempts: Record<string, RecordedAttempt> = {
      stepA: { result: 'CORRECT', numericValue: 100 },
      stepB: { result: 'CORRECT', numericValue: 50 },
    };
    const judgements = classifySteps(steps, attempts);
    expect(judgements.every((j) => j.classification === 'CORRECT')).toBe(true);
    expect(findFirstErrorStepId(judgements)).toBeNull();
  });

  it('treats a skipped step as SKIPPED, not as an error to attribute later work to', () => {
    const attempts: Record<string, RecordedAttempt> = {
      stepA: { result: 'INCOMPLETE', numericValue: null, skipped: true },
      stepB: { result: 'CORRECT', numericValue: 50 },
    };
    const judgements = classifySteps(steps, attempts);
    expect(judgements.find((j) => j.stepId === 'stepA')?.classification).toBe('SKIPPED');
    expect(judgements.find((j) => j.stepId === 'stepB')?.classification).toBe('CORRECT');
  });

  it('leaves not-yet-attempted steps PENDING', () => {
    const attempts: Record<string, RecordedAttempt> = { stepA: { result: 'CORRECT', numericValue: 100 } };
    const judgements = classifySteps(steps, attempts);
    expect(judgements.find((j) => j.stepId === 'stepB')?.classification).toBe('PENDING');
  });
});

describe('classifySteps - wired against the real speed/distance/time problem template', () => {
  it('propagates a wrong "identify" field through the calculate and verify steps as cascading, not independent', () => {
    const problem = buildSpeedDistanceTimeProblem();
    const attempts: Record<string, RecordedAttempt> = {
      understand: { result: 'CORRECT', numericValue: null },
      // Student mis-copies the distance as 380 instead of 360.
      identify: { result: 'PARTIALLY_CORRECT', numericValue: null, structuredValues: { distance: 380, speed: 60 } },
      select_strategy: { result: 'CORRECT', numericValue: null },
      // 380 / 60 = 6.333..., which IS what a charitable reading of their own Step 2 predicts.
      calculate: { result: 'INCORRECT', numericValue: 380 / 60 },
      verify_unit: { result: 'INCORRECT', numericValue: 380 / 60 },
    };
    const judgements = classifySteps(problem.steps, attempts);
    expect(judgements.find((j) => j.stepId === 'identify')?.classification).toBe('FIRST_ERROR');
    expect(judgements.find((j) => j.stepId === 'calculate')?.classification).toBe('AFFECTED_BY_PRIOR_ERROR');
    expect(judgements.find((j) => j.stepId === 'verify_unit')?.classification).toBe('AFFECTED_BY_PRIOR_ERROR');
  });

  it('classifies a calculation slip unrelated to the identify step as INDEPENDENT_ERROR', () => {
    const problem = buildSpeedDistanceTimeProblem();
    const attempts: Record<string, RecordedAttempt> = {
      understand: { result: 'CORRECT', numericValue: null },
      identify: { result: 'CORRECT', numericValue: null, structuredValues: { distance: 360, speed: 60 } },
      select_strategy: { result: 'CORRECT', numericValue: null },
      // Correct inputs, but a fresh arithmetic mistake unrelated to any earlier step.
      calculate: { result: 'INCORRECT', numericValue: 42 },
    };
    const judgements = classifySteps(problem.steps, attempts);
    expect(judgements.find((j) => j.stepId === 'calculate')?.classification).toBe('FIRST_ERROR');
  });
});
