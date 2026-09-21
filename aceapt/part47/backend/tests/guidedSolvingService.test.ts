import { describe, it, expect } from 'vitest';
import { buildTestService, makeTestDataDir } from './helpers/testService.js';
import { ForbiddenError, GuidanceUnavailableError } from '../src/services/errors.js';
import { OptimisticLockError } from '../src/repositories/guidedSessionRepository.js';

describe('GuidedSolvingService - full guided-solving happy path (Section 117)', () => {
  it('completes independently with zero hints and reports LOW guidance dependency', async () => {
    const service = buildTestService(makeTestDataDir());
    const session = await service.startSession({ studentId: 'stu-1', problemId: 'sdt-train-360-60' });
    expect(session.totalSteps).toBe(5);

    expect((await service.submitStep({ sessionId: session.sessionId, stepId: 'understand', rawInput: 'time' })).result).toBe('CORRECT');
    expect(
      (
        await service.submitStep({
          sessionId: session.sessionId,
          stepId: 'identify',
          rawInput: JSON.stringify({ distance: '360', speed: '60' }),
        })
      ).result,
    ).toBe('CORRECT');
    expect((await service.submitStep({ sessionId: session.sessionId, stepId: 'select_strategy', rawInput: 'a' })).result).toBe('CORRECT');
    expect((await service.submitStep({ sessionId: session.sessionId, stepId: 'calculate', rawInput: '6' })).result).toBe('CORRECT');
    const last = await service.submitStep({ sessionId: session.sessionId, stepId: 'verify_unit', rawInput: '6 hours' });
    expect(last.result).toBe('CORRECT');
    expect(last.allStepsComplete).toBe(true);

    const outcome = await service.completeSession(session.sessionId);
    expect(outcome.stepsTotal).toBe(5);
    expect(outcome.stepsIndependent).toBe(5);
    expect(outcome.hintsUsed).toBe(0);
    expect(outcome.guidanceDependency).toBe('LOW');
    expect(outcome.recoverySuccess).toBe(false); // nothing to recover from
  });
});

describe('GuidedSolvingService - recovery with guidance (Sections 20-21, 101)', () => {
  it('marks recovered_with_guidance, not independent success, after a wrong attempt + hint + correct retry', async () => {
    const service = buildTestService(makeTestDataDir());
    const session = await service.startSession({ studentId: 'stu-2', problemId: 'sdt-train-360-60' });
    await service.submitStep({ sessionId: session.sessionId, stepId: 'understand', rawInput: 'time' });
    await service.submitStep({ sessionId: session.sessionId, stepId: 'identify', rawInput: JSON.stringify({ distance: '360', speed: '60' }) });

    const wrong = await service.submitStep({ sessionId: session.sessionId, stepId: 'select_strategy', rawInput: 'b' });
    expect(wrong.result).toBe('INCORRECT');

    const guidance = await service.requestGuidance({ sessionId: session.sessionId, stepId: 'select_strategy' });
    expect(guidance.source).toBe('DETERMINISTIC_FALLBACK'); // no ANTHROPIC_API_KEY in the test environment
    expect(guidance.message.length).toBeGreaterThan(0);

    const corrected = await service.submitStep({ sessionId: session.sessionId, stepId: 'select_strategy', rawInput: 'a' });
    expect(corrected.result).toBe('CORRECT');

    await service.submitStep({ sessionId: session.sessionId, stepId: 'calculate', rawInput: '6' });
    await service.submitStep({ sessionId: session.sessionId, stepId: 'verify_unit', rawInput: '6 hours' });

    const outcome = await service.completeSession(session.sessionId);
    expect(outcome.firstErrorStepId).toBe('select_strategy');
    expect(outcome.recoverySuccess).toBe(true);
    expect(outcome.stepsIndependent).toBe(4); // select_strategy needed a hint, so it does not count
    expect(outcome.stepsAssisted).toBe(1);
    expect(outcome.hintsUsed).toBe(1);
  });
});

describe('GuidedSolvingService - skipping (Section 75)', () => {
  it('never counts a skipped step as independent or mastered', async () => {
    const service = buildTestService(makeTestDataDir());
    const session = await service.startSession({ studentId: 'stu-3', problemId: 'pct-marks-45-60' });
    await service.submitStep({ sessionId: session.sessionId, stepId: 'understand', rawInput: 'percentage' });
    const afterSkip = await service.skipStep(session.sessionId, 'identify');
    expect(afterSkip.solvingPath.find((s) => s.stepId === 'identify')?.status).toBe('SKIPPED');

    await service.submitStep({ sessionId: session.sessionId, stepId: 'calculate', rawInput: '75' });
    await service.submitStep({ sessionId: session.sessionId, stepId: 'verify_unit', rawInput: '75%' });

    const outcome = await service.completeSession(session.sessionId);
    expect(outcome.stepsTotal).toBe(4);
    expect(outcome.stepsIndependent).toBe(3);
  });
});

describe('GuidedSolvingService - full solution reveal and reconstruction (Sections 28-29, 76, 102)', () => {
  it('reveals the answer only after an explicit request, and never counts it as independent solving', async () => {
    const service = buildTestService(makeTestDataDir());
    const session = await service.startSession({ studentId: 'stu-4', problemId: 'sdt-train-360-60' });

    const solution = await service.revealFullSolution(session.sessionId);
    expect(solution.steps).toHaveLength(5);
    expect(solution.steps.find((s) => s.stepId === 'calculate')?.answer).toBe('6');

    const reconstruction = await service.submitReconstruction(session.sessionId, {
      formula: 'distance / speed',
      first_operation: 'divide 360 by 60',
    });
    expect(reconstruction.success).toBe(true);

    const outcome = await service.completeSession(session.sessionId);
    expect(outcome.solutionRequested).toBe(true);
    expect(outcome.reconstructionSuccess).toBe(true);
    expect(outcome.stepsIndependent).toBe(0);
    expect(outcome.guidanceDependency).toBe('HIGH');
  });

  it('records a failed reconstruction honestly rather than assuming understanding', async () => {
    const service = buildTestService(makeTestDataDir());
    const session = await service.startSession({ studentId: 'stu-4b', problemId: 'sdt-train-360-60' });
    await service.revealFullSolution(session.sessionId);
    const reconstruction = await service.submitReconstruction(session.sessionId, { formula: 'I have no idea', first_operation: 'guessing' });
    expect(reconstruction.success).toBe(false);
    expect(reconstruction.results.every((r) => !r.correct)).toBe(true);
  });
});

describe('GuidedSolvingService - independent verification / transfer (Sections 30-31, 77-78, 106)', () => {
  it('blocks every guidance-granting action during verification mode', async () => {
    const service = buildTestService(makeTestDataDir());
    const session = await service.startSession({ studentId: 'stu-5', problemId: 'sdt-train-360-60' });
    await service.submitStep({ sessionId: session.sessionId, stepId: 'understand', rawInput: 'time' });
    await service.submitStep({ sessionId: session.sessionId, stepId: 'identify', rawInput: JSON.stringify({ distance: '360', speed: '60' }) });
    await service.submitStep({ sessionId: session.sessionId, stepId: 'select_strategy', rawInput: 'a' });
    await service.submitStep({ sessionId: session.sessionId, stepId: 'calculate', rawInput: '6' });
    await service.submitStep({ sessionId: session.sessionId, stepId: 'verify_unit', rawInput: '6 hours' });
    await service.completeSession(session.sessionId);

    const verification = await service.startVerification(session.sessionId);
    expect(verification.mode).toBe('VERIFICATION');
    expect(verification.allowsGuidance).toBe(false);
    expect(verification.problemPromptText).not.toBe(session.problemPromptText);

    await expect(service.requestGuidance({ sessionId: verification.sessionId, stepId: 'understand' })).rejects.toThrow(GuidanceUnavailableError);
    await expect(service.requestExplanation(verification.sessionId, 'understand')).rejects.toThrow(GuidanceUnavailableError);
    await expect(service.showNextStep(verification.sessionId)).rejects.toThrow(GuidanceUnavailableError);
    await expect(service.revealFullSolution(verification.sessionId)).rejects.toThrow(GuidanceUnavailableError);
  });

  it('propagates verification/transfer success back onto the parent guided session outcome', async () => {
    const service = buildTestService(makeTestDataDir());
    const session = await service.startSession({ studentId: 'stu-6', problemId: 'sdt-train-360-60' });
    await service.submitStep({ sessionId: session.sessionId, stepId: 'understand', rawInput: 'time' });
    await service.submitStep({ sessionId: session.sessionId, stepId: 'identify', rawInput: JSON.stringify({ distance: '360', speed: '60' }) });
    await service.submitStep({ sessionId: session.sessionId, stepId: 'select_strategy', rawInput: 'a' });
    await service.submitStep({ sessionId: session.sessionId, stepId: 'calculate', rawInput: '6' });
    await service.submitStep({ sessionId: session.sessionId, stepId: 'verify_unit', rawInput: '6 hours' });
    await service.completeSession(session.sessionId);

    const verification = await service.startVerification(session.sessionId);
    // Transfer variant is the cyclist problem: 180 km at 45 km/h = 4 hours.
    await service.submitStep({ sessionId: verification.sessionId, stepId: 'understand', rawInput: 'time' });
    await service.submitStep({ sessionId: verification.sessionId, stepId: 'identify', rawInput: JSON.stringify({ distance: '180', speed: '45' }) });
    await service.submitStep({ sessionId: verification.sessionId, stepId: 'select_strategy', rawInput: 'a' });
    await service.submitStep({ sessionId: verification.sessionId, stepId: 'calculate', rawInput: '4' });
    await service.submitStep({ sessionId: verification.sessionId, stepId: 'verify_unit', rawInput: '4 hours' });
    const verificationOutcome = await service.completeSession(verification.sessionId);
    expect(verificationOutcome.verificationSuccess).toBe(true);
    expect(verificationOutcome.transferSuccess).toBe(true);

    const parentSummary = await service.getSummary(session.sessionId);
    expect(parentSummary.outcome.verificationSuccess).toBe(true);
    expect(parentSummary.outcome.verificationSessionId).toBe(verification.sessionId);
  });
});

describe('GuidedSolvingService - concurrency and idempotency (Sections 93, 107)', () => {
  it('rejects a submission carrying a stale version instead of silently overwriting', async () => {
    const service = buildTestService(makeTestDataDir());
    const session = await service.startSession({ studentId: 'stu-7', problemId: 'sdt-train-360-60' });
    await expect(
      service.submitStep({ sessionId: session.sessionId, stepId: 'understand', rawInput: 'time', expectedVersion: 999 }),
    ).rejects.toThrow(OptimisticLockError);
  });

  it('treats a repeated submission with the same clientRequestId as a safe no-op, never a double advance', async () => {
    const service = buildTestService(makeTestDataDir());
    const session = await service.startSession({ studentId: 'stu-8', problemId: 'pct-marks-45-60' });
    const first = await service.submitStep({
      sessionId: session.sessionId,
      stepId: 'understand',
      rawInput: 'percentage',
      clientRequestId: 'retry-key-1',
    });
    expect(first.deduped).toBe(false);
    expect(first.session.currentStepIndex).toBe(1);

    const second = await service.submitStep({
      sessionId: session.sessionId,
      stepId: 'understand',
      rawInput: 'percentage',
      clientRequestId: 'retry-key-1',
    });
    expect(second.deduped).toBe(true);
    expect(second.session.currentStepIndex).toBe(1); // did not advance a second time
  });
});

describe('GuidedSolvingService - ownership (Sections 94, 111)', () => {
  it('refuses to return a session belonging to a different student', async () => {
    const service = buildTestService(makeTestDataDir());
    const session = await service.startSession({ studentId: 'stu-owner', problemId: 'sdt-train-360-60' });
    await expect(service.getSession(session.sessionId, 'stu-intruder')).rejects.toThrow(ForbiddenError);
    await expect(service.getSession(session.sessionId, 'stu-owner')).resolves.toBeDefined();
  });
});

describe('GuidedSolvingService - persistence survives a fresh process (Section 108: resume after refresh)', () => {
  it('is readable from a brand new service instance pointed at the same data directory', async () => {
    const dataDir = makeTestDataDir();
    const serviceA = buildTestService(dataDir);
    const session = await serviceA.startSession({ studentId: 'stu-resume', problemId: 'pct-marks-45-60' });
    await serviceA.submitStep({ sessionId: session.sessionId, stepId: 'understand', rawInput: 'percentage' });

    const serviceB = buildTestService(dataDir); // simulates a fresh server process - no shared in-memory state
    const resumed = await serviceB.getSession(session.sessionId);
    expect(resumed.currentStepIndex).toBe(1);
    expect(resumed.solvingPath.find((s) => s.stepId === 'understand')?.status).toBe('COMPLETED');
  });
});
