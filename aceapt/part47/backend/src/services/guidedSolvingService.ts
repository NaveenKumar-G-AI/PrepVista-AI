import { randomUUID } from 'node:crypto';
import type { ProblemBankPort } from '../domain/problemBank/index.js';
import type { ProblemTemplate, StepTemplate, StepResult } from '../domain/problemBank/types.js';
import { validateStep } from '../domain/engine/validation/index.js';
import { validateAnswerKey } from '../domain/engine/validation/answerKey.js';
import { classifySteps, type RecordedAttempt, type StepJudgement } from '../domain/engine/errorLocalization.js';
import { nextAutoEscalationLevel, decayLevelAfterSuccess, helpLevelLabel, MAX_AUTO_ESCALATION_LEVEL } from '../domain/engine/helpLevels.js';
import { classifyAssistanceNeed } from '../domain/engine/assistanceClassifier.js';
import { recommendNextHelpLevel } from '../domain/engine/fading.js';
import { assertSessionTransition, assertSequentialAdvance } from '../domain/engine/stateMachine.js';
import { requestAiGuidance } from '../domain/ai/aiClient.js';
import { buildFallbackGuidance } from '../domain/ai/fallback.js';
import type { MistakeEvidence, MistakeIntelligencePort } from '../domain/integrations/mistakeIntelligence.js';
import type { MasteryPort } from '../domain/integrations/mastery.js';
import type { AnalyticsSink } from '../domain/integrations/analytics.js';
import type { GuidedSessionRepository } from '../repositories/guidedSessionRepository.js';
import { OptimisticLockError } from '../repositories/guidedSessionRepository.js';
import type { GuidedStepStateRepository } from '../repositories/guidedStepStateRepository.js';
import type { GuidedAttemptRepository } from '../repositories/guidedAttemptRepository.js';
import type { GuidedAssistanceRepository } from '../repositories/guidedAssistanceRepository.js';
import type { GuidedOutcomeRepository } from '../repositories/guidedOutcomeRepository.js';
import type {
  AssistanceSource,
  GuidedAttemptRecord,
  GuidedOutcomeRecord,
  GuidedSessionRecord,
  GuidedStepStateRecord,
} from '../repositories/records.js';
import { computeOutcomeStats, computeRecoverySuccess } from './outcomeCalculator.js';
import { describeExpectedAnswer } from './describeAnswer.js';
import { ForbiddenError, GuidanceUnavailableError, InvalidRequestError, NotFoundError } from './errors.js';
import {
  ALLOWED_STUDENT_FEEDBACK,
  toPastProblemRecord,
  type CurrentStepView,
  type FullSolutionView,
  type GuidanceView,
  type NextStepPreview,
  type ReconstructionResult,
  type SessionView,
  type SolvingPathStepView,
  type StudentFeedback,
  type SubmitStepResult,
  type SummaryView,
} from './views.js';

export interface GuidedSolvingServiceDeps {
  problemBank: ProblemBankPort;
  sessions: GuidedSessionRepository;
  stepStates: GuidedStepStateRepository;
  attempts: GuidedAttemptRepository;
  assistance: GuidedAssistanceRepository;
  outcomes: GuidedOutcomeRepository;
  analytics: AnalyticsSink;
  mistakeIntelligence: MistakeIntelligencePort;
  mastery: MasteryPort;
}

/**
 * The core orchestrator. Every rule from the spec that isn't purely a math
 * question lives here: state transitions, help-level policy, what counts as
 * independent, and wiring the deterministic engine together with the
 * optional AI layer. Nothing in this class does its own math grading or its
 * own persistence format - both are delegated (Sections 57, 70).
 */
export class GuidedSolvingService {
  constructor(private readonly deps: GuidedSolvingServiceDeps) {}

  // ---------------------------------------------------------------------
  // Session lifecycle (Section 8, 71)
  // ---------------------------------------------------------------------

  async listProblems() {
    return this.deps.problemBank.list();
  }

  async startSession(input: { studentId: string; problemId: string }): Promise<SessionView> {
    const problem = await this.deps.problemBank.getById(input.problemId);
    if (!problem) throw new NotFoundError(`Unknown problemId: ${input.problemId}`);

    const history = await this.deps.outcomes.listByStudent(input.studentId);
    const suggestedInitialHelpLevel = recommendNextHelpLevel(history.map(toPastProblemRecord));

    const now = new Date().toISOString();
    const session: GuidedSessionRecord = {
      id: randomUUID(),
      studentId: input.studentId,
      problemId: input.problemId,
      variantId: null,
      status: 'STARTED',
      mode: 'GUIDED',
      currentStepIndex: 0,
      version: 0,
      firstErrorStepId: null,
      solutionRevealed: false,
      solutionRequested: false,
      reconstructionSuccess: null,
      parentSessionId: null,
      startedAt: now,
      lastActivityAt: now,
      completedAt: null,
    };
    await this.deps.sessions.create(session);

    const firstStep = problem.steps[0];
    if (firstStep) {
      await this.ensureStepState(session.id, firstStep, suggestedInitialHelpLevel);
      this.deps.analytics.track('guided_step_started', { sessionId: session.id, stepId: firstStep.stepId });
    }
    this.deps.analytics.track('guided_session_started', {
      sessionId: session.id,
      studentId: input.studentId,
      problemId: input.problemId,
      suggestedInitialHelpLevel,
    });

    return this.buildSessionView(session, problem, problem.steps);
  }

  async getSession(sessionId: string, requestingStudentId?: string): Promise<SessionView> {
    const session = await this.requireOwnedSession(sessionId, requestingStudentId);
    const { problem, steps } = await this.loadProblemAndSteps(session);
    return this.buildSessionView(session, problem, steps);
  }

  async getCurrentStep(sessionId: string, requestingStudentId?: string): Promise<CurrentStepView> {
    const session = await this.requireOwnedSession(sessionId, requestingStudentId);
    const { steps } = await this.loadProblemAndSteps(session);
    if (session.currentStepIndex >= steps.length) {
      throw new InvalidRequestError('All steps are already complete for this session - call completeSession.');
    }
    const step = steps[session.currentStepIndex]!;
    const stepState = await this.ensureStepState(session.id, step, undefined);
    return this.buildCurrentStepView(steps, step, stepState);
  }

  async abandonSession(sessionId: string, requestingStudentId?: string): Promise<void> {
    const session = await this.requireOwnedSession(sessionId, requestingStudentId);
    assertSessionTransition(session.status, 'ABANDONED');
    await this.persistSessionUpdate(session, { status: 'ABANDONED' });
    this.deps.analytics.track('guided_abandoned', { sessionId: session.id });
  }

  // ---------------------------------------------------------------------
  // Step interaction (Sections 13-21, 55-61, 72-73, 93)
  // ---------------------------------------------------------------------

  async submitStep(input: {
    sessionId: string;
    stepId: string;
    rawInput: string;
    expectedVersion?: number;
    clientRequestId?: string;
    requestingStudentId?: string;
  }): Promise<SubmitStepResult> {
    let session = await this.requireOwnedSession(input.sessionId, input.requestingStudentId);
    const { problem, steps } = await this.loadProblemAndSteps(session);

    const stepIndex = steps.findIndex((s) => s.stepId === input.stepId);
    if (stepIndex === -1) throw new NotFoundError(`Unknown stepId ${input.stepId} for this session's problem.`);
    const step = steps[stepIndex]!;

    // Idempotent-retry guard (Sections 93, 107) runs FIRST, before the
    // current-step check: a legitimate network retry of an already-processed
    // submission may arrive after the session has already advanced past this
    // step, and must still be recognized as a safe no-op rather than a
    // "wrong step" error.
    const existingStepState = await this.deps.stepStates.findBySessionAndStep(session.id, step.stepId);
    if (input.clientRequestId && existingStepState) {
      const priorAttempts = await this.deps.attempts.listForStepState(existingStepState.id);
      const duplicate = priorAttempts.find((a) => a.clientRequestId === input.clientRequestId);
      if (duplicate) {
        return {
          result: duplicate.result,
          detail: duplicate.detail,
          session: await this.buildSessionView(session, problem, steps),
          allStepsComplete: session.currentStepIndex >= steps.length,
          deduped: true,
        };
      }
    }

    if (stepIndex !== session.currentStepIndex) {
      throw new InvalidRequestError('That step is not the current step for this session.');
    }
    const stepState = existingStepState ?? (await this.ensureStepState(session.id, step, undefined));

    if (input.expectedVersion !== undefined && input.expectedVersion !== session.version) {
      throw new OptimisticLockError(session.id, input.expectedVersion, session.version);
    }

    const outcome = validateStep(step, input.rawInput);
    const attemptNumber = (await this.deps.attempts.listForStepState(stepState.id)).length + 1;
    const now = new Date();

    const attempt: GuidedAttemptRecord = {
      id: randomUUID(),
      sessionId: session.id,
      stepStateId: stepState.id,
      stepId: step.stepId,
      attemptNumber,
      rawInput: input.rawInput,
      result: outcome.result,
      numericValue: outcome.numericValue ?? null,
      structuredValues: outcome.structuredValues ?? null,
      detail: outcome.detail ?? null,
      elapsedMs: now.getTime() - new Date(stepState.startedAt).getTime(),
      clientRequestId: input.clientRequestId ?? null,
      createdAt: now.toISOString(),
    };
    await this.deps.attempts.create(attempt);

    const updatedStepState: GuidedStepStateRecord = { ...stepState };
    let advanced = false;

    if (outcome.result === 'CORRECT') {
      const wasStruggling = stepState.consecutiveFailures > 0;
      updatedStepState.status = 'CORRECT';
      updatedStepState.completedAt = now.toISOString();
      updatedStepState.consecutiveFailures = 0;
      updatedStepState.helpLevel = decayLevelAfterSuccess(stepState.helpLevel);
      if (wasStruggling && !stepState.independent) updatedStepState.recoveredWithGuidance = true;
      advanced = true;
      this.deps.analytics.track('guided_step_completed', { sessionId: session.id, stepId: step.stepId, attemptNumber });
    } else if (outcome.result === 'INCOMPLETE') {
      updatedStepState.status = 'INCOMPLETE';
    } else {
      updatedStepState.status = outcome.result;
      updatedStepState.consecutiveFailures = stepState.consecutiveFailures + 1;
      const nextLevel = nextAutoEscalationLevel(stepState.helpLevel, updatedStepState.consecutiveFailures);
      if (nextLevel > stepState.helpLevel) {
        updatedStepState.helpLevel = nextLevel;
        updatedStepState.independent = false;
        await this.deps.assistance.create({
          id: randomUUID(),
          sessionId: session.id,
          stepId: step.stepId,
          type: 'AUTO_ESCALATION',
          helpLevel: nextLevel,
          assistanceIssueType: null,
          source: 'TEMPLATE',
          message: `Guidance increased to "${helpLevelLabel(nextLevel)}" after ${updatedStepState.consecutiveFailures} attempts on this step.`,
          createdAt: now.toISOString(),
        });
      }
      this.deps.analytics.track('guided_step_failed', {
        sessionId: session.id,
        stepId: step.stepId,
        result: outcome.result,
        consecutiveFailures: updatedStepState.consecutiveFailures,
      });
    }

    await this.deps.stepStates.upsert(updatedStepState);

    // Sticky, not recomputed: this records the first step where the student's work was
    // ever not-yet-correct, for outcome/mistake-intelligence reporting (Sections 42, 45, 86).
    // It deliberately does NOT "heal" if the student later corrects that step - a live,
    // healing view of current step status is what solvingPath/classifyAllSteps is for
    // (used below in buildSessionView), which is a separate concern from this historical record.
    const isMeaningfulError = outcome.result !== 'CORRECT' && outcome.result !== 'INCOMPLETE';
    const firstErrorStepId = session.firstErrorStepId ?? (isMeaningfulError ? step.stepId : null);

    const nextIndex = advanced ? session.currentStepIndex + 1 : session.currentStepIndex;
    assertSequentialAdvance(session.currentStepIndex, nextIndex, steps.length);

    session = await this.persistSessionUpdate(session, {
      status: session.status === 'STARTED' ? 'ACTIVE' : session.status,
      currentStepIndex: nextIndex,
      firstErrorStepId,
    });

    if (advanced && nextIndex < steps.length) {
      await this.ensureStepState(session.id, steps[nextIndex]!, undefined);
      this.deps.analytics.track('guided_step_started', { sessionId: session.id, stepId: steps[nextIndex]!.stepId });
    }

    return {
      result: outcome.result,
      detail: outcome.detail ?? null,
      session: await this.buildSessionView(session, problem, steps),
      allStepsComplete: nextIndex >= steps.length,
      deduped: false,
    };
  }

  async retryStep(sessionId: string, stepId: string, requestingStudentId?: string): Promise<CurrentStepView> {
    const session = await this.requireOwnedSession(sessionId, requestingStudentId);
    const { steps } = await this.loadProblemAndSteps(session);
    const step = steps.find((s) => s.stepId === stepId);
    if (!step) throw new NotFoundError(`Unknown stepId ${stepId}.`);
    this.deps.analytics.track('guided_retry', { sessionId: session.id, stepId });
    const stepState = await this.ensureStepState(session.id, step, undefined);
    return this.buildCurrentStepView(steps, step, stepState);
  }

  async skipStep(sessionId: string, stepId: string, requestingStudentId?: string): Promise<SessionView> {
    let session = await this.requireOwnedSession(sessionId, requestingStudentId);
    const { problem, steps } = await this.loadProblemAndSteps(session);
    const stepIndex = steps.findIndex((s) => s.stepId === stepId);
    if (stepIndex === -1) throw new NotFoundError(`Unknown stepId ${stepId}.`);
    if (stepIndex !== session.currentStepIndex) throw new InvalidRequestError('Only the current step can be skipped.');

    const step = steps[stepIndex]!;
    const stepState = await this.ensureStepState(session.id, step, undefined);
    // Section 75: skipping is recorded plainly and never counted as mastered - it deliberately does NOT set `independent`.
    await this.deps.stepStates.upsert({ ...stepState, status: 'SKIPPED', skipped: true, completedAt: new Date().toISOString() });

    const nextIndex = stepIndex + 1;
    assertSequentialAdvance(session.currentStepIndex, nextIndex, steps.length);
    session = await this.persistSessionUpdate(session, {
      status: session.status === 'STARTED' ? 'ACTIVE' : session.status,
      currentStepIndex: nextIndex,
    });

    if (nextIndex < steps.length) await this.ensureStepState(session.id, steps[nextIndex]!, undefined);

    this.deps.analytics.track('guided_step_skipped', { sessionId: session.id, stepId });
    return this.buildSessionView(session, problem, steps);
  }

  // ---------------------------------------------------------------------
  // Help (Sections 22-29, 62-66)
  // ---------------------------------------------------------------------

  async requestGuidance(input: { sessionId: string; stepId: string; studentNote?: string; requestingStudentId?: string }): Promise<GuidanceView> {
    const session = await this.requireOwnedSession(input.sessionId, input.requestingStudentId);
    this.assertGuidanceAllowed(session);
    const { steps, title } = await this.loadProblemAndSteps(session);
    const step = steps.find((s) => s.stepId === input.stepId);
    if (!step) throw new NotFoundError(`Unknown stepId ${input.stepId}.`);
    const stepState = await this.ensureStepState(session.id, step, undefined);

    const lastAttempt = (await this.deps.attempts.listForStepState(stepState.id)).at(-1);
    const issueType = classifyAssistanceNeed({ lastResult: lastAttempt?.result, studentNote: input.studentNote });
    const helpLevel = Math.min(Math.max(stepState.helpLevel, 1), MAX_AUTO_ESCALATION_LEVEL);

    const aiResult = await requestAiGuidance({
      action: 'GIVE_HINT',
      problemTitle: title,
      step,
      helpLevel,
      targetIssue: issueType,
      studentAttempt: lastAttempt?.rawInput,
      studentNote: input.studentNote,
      lastValidationDetail: lastAttempt?.detail ?? undefined,
    });
    const guidance = aiResult ?? buildFallbackGuidance({ action: 'GIVE_HINT', step, helpLevel, targetIssue: issueType });
    const source: AssistanceSource = aiResult ? 'AI' : 'DETERMINISTIC_FALLBACK';

    await this.deps.assistance.create({
      id: randomUUID(),
      sessionId: session.id,
      stepId: step.stepId,
      type: 'HINT',
      helpLevel,
      assistanceIssueType: issueType,
      source,
      message: guidance.message,
      createdAt: new Date().toISOString(),
    });
    await this.deps.stepStates.upsert({ ...stepState, independent: false, helpLevel });

    this.deps.analytics.track('guided_hint_requested', { sessionId: session.id, stepId: step.stepId, helpLevel, issueType, source });

    return { message: guidance.message, helpLevel, issueType, source };
  }

  async requestExplanation(sessionId: string, stepId: string, requestingStudentId?: string): Promise<GuidanceView> {
    const session = await this.requireOwnedSession(sessionId, requestingStudentId);
    this.assertGuidanceAllowed(session);
    const { steps, title } = await this.loadProblemAndSteps(session);
    const step = steps.find((s) => s.stepId === stepId);
    if (!step) throw new NotFoundError(`Unknown stepId ${stepId}.`);
    const stepState = await this.ensureStepState(session.id, step, undefined);

    const helpLevel = Math.min(Math.max(stepState.helpLevel, 2), MAX_AUTO_ESCALATION_LEVEL);
    const aiResult = await requestAiGuidance({ action: 'EXPLAIN_STEP', problemTitle: title, step, helpLevel });
    const guidance = aiResult ?? buildFallbackGuidance({ action: 'EXPLAIN_STEP', step, helpLevel });
    const source: AssistanceSource = aiResult ? 'AI' : 'DETERMINISTIC_FALLBACK';

    await this.deps.assistance.create({
      id: randomUUID(),
      sessionId: session.id,
      stepId: step.stepId,
      type: 'EXPLANATION',
      helpLevel,
      assistanceIssueType: null,
      source,
      message: guidance.message,
      createdAt: new Date().toISOString(),
    });
    await this.deps.stepStates.upsert({ ...stepState, independent: false, helpLevel });

    this.deps.analytics.track('guided_explanation_requested', { sessionId: session.id, stepId: step.stepId, source });

    return { message: guidance.message, helpLevel, source };
  }

  async showNextStep(sessionId: string, requestingStudentId?: string): Promise<NextStepPreview> {
    const session = await this.requireOwnedSession(sessionId, requestingStudentId);
    this.assertGuidanceAllowed(session);
    const { steps } = await this.loadProblemAndSteps(session);
    const currentStep = steps[session.currentStepIndex];
    const upcoming = steps[session.currentStepIndex + 1];

    if (currentStep) {
      const stepState = await this.ensureStepState(session.id, currentStep, undefined);
      await this.deps.stepStates.upsert({ ...stepState, independent: false });
      // Section 26: only the STRUCTURE (objective/prompt) of the next step - never its validation
      // spec or expected answer. The GuidedAssistance record this creates is itself the analytics
      // trail for this action (Section 89's event list has no separate "next step" event).
      await this.deps.assistance.create({
        id: randomUUID(),
        sessionId: session.id,
        stepId: currentStep.stepId,
        type: 'NEXT_STEP',
        helpLevel: stepState.helpLevel,
        assistanceIssueType: null,
        source: 'TEMPLATE',
        message: upcoming ? `Next: ${upcoming.objective}` : 'This is the final step of the problem.',
        createdAt: new Date().toISOString(),
      });
    }

    return {
      nextStepPreview: upcoming ? { objective: upcoming.objective, prompt: upcoming.prompt, type: upcoming.type } : null,
      isFinalStep: !upcoming,
    };
  }

  async revealFullSolution(sessionId: string, requestingStudentId?: string): Promise<FullSolutionView> {
    const session = await this.requireOwnedSession(sessionId, requestingStudentId);
    this.assertGuidanceAllowed(session);
    const { problem, steps, title } = await this.loadProblemAndSteps(session);

    await this.persistSessionUpdate(session, { solutionRevealed: true, solutionRequested: true });

    await this.deps.assistance.create({
      id: randomUUID(),
      sessionId: session.id,
      stepId: null,
      type: 'FULL_SOLUTION',
      helpLevel: 7,
      assistanceIssueType: null,
      source: 'TEMPLATE',
      message: `Full solution revealed for "${title}".`,
      createdAt: new Date().toISOString(),
    });

    this.deps.analytics.track('solution_revealed', { sessionId: session.id, problemId: problem.problemId });

    return {
      steps: steps.map((step) => ({
        stepId: step.stepId,
        objective: step.objective,
        explanation: step.explanation,
        answer: describeExpectedAnswer(step),
      })),
      reconstructionPrompts: problem.reconstructionPrompts.map((p) => ({ promptId: p.promptId, prompt: p.prompt })),
    };
  }

  async submitReconstruction(sessionId: string, answers: Record<string, string>, requestingStudentId?: string): Promise<ReconstructionResult> {
    const session = await this.requireOwnedSession(sessionId, requestingStudentId);
    const { problem } = await this.loadProblemAndSteps(session);

    const results = problem.reconstructionPrompts.map((rp) => ({
      promptId: rp.promptId,
      correct: validateAnswerKey(answers[rp.promptId] ?? '', { acceptable: rp.acceptable }).result === 'CORRECT',
    }));
    const success = results.length > 0 && results.every((r) => r.correct);

    await this.persistSessionUpdate(session, { reconstructionSuccess: success });

    return { success, results };
  }

  // ---------------------------------------------------------------------
  // Completion, verification/transfer, and summary (Sections 30-31, 45-46, 76-90)
  // ---------------------------------------------------------------------

  async completeSession(sessionId: string, requestingStudentId?: string): Promise<GuidedOutcomeRecord> {
    const session = await this.requireOwnedSession(sessionId, requestingStudentId);
    const { problem, steps } = await this.loadProblemAndSteps(session);
    assertSessionTransition(session.status, 'COMPLETED');

    const stepStates = await this.deps.stepStates.listForSession(session.id);
    const assistanceEvents = await this.deps.assistance.listForSession(session.id);
    const attempts = await this.deps.attempts.listForSession(session.id);

    const stats = computeOutcomeStats(stepStates, assistanceEvents, attempts);
    const recoverySuccess = computeRecoverySuccess(session.firstErrorStepId, stepStates);
    const isVerification = session.mode === 'VERIFICATION';
    const verificationSuccess = isVerification ? stats.stepsTotal > 0 && stats.stepsIndependent === stats.stepsTotal : null;

    const outcome: GuidedOutcomeRecord = {
      id: session.id,
      sessionId: session.id,
      studentId: session.studentId,
      problemId: session.problemId,
      stepsTotal: stats.stepsTotal,
      // Section 76: a revealed solution is never counted as independent solving, no matter how the steps look.
      stepsIndependent: session.solutionRevealed ? 0 : stats.stepsIndependent,
      stepsAssisted: session.solutionRevealed ? stats.stepsTotal - stats.stepsSkipped : stats.stepsAssisted,
      hintsUsed: stats.hintsUsed,
      retries: stats.retries,
      firstErrorStepId: session.firstErrorStepId,
      recoverySuccess,
      solutionRequested: session.solutionRequested,
      reconstructionSuccess: session.reconstructionSuccess,
      verificationSessionId: null,
      verificationSuccess,
      transferSuccess: isVerification ? verificationSuccess : null,
      guidanceDependency: session.solutionRevealed ? 'HIGH' : stats.guidanceDependency,
      studentFeedback: null,
      createdAt: new Date().toISOString(),
    };
    await this.deps.outcomes.upsert(outcome);
    await this.persistSessionUpdate(session, { status: 'COMPLETED', completedAt: new Date().toISOString() });

    if (isVerification && session.parentSessionId) {
      const parentOutcome = await this.deps.outcomes.findBySessionId(session.parentSessionId);
      if (parentOutcome) {
        await this.deps.outcomes.upsert({
          ...parentOutcome,
          verificationSessionId: session.id,
          verificationSuccess,
          transferSuccess: verificationSuccess,
        });
      }
      this.deps.analytics.track('independent_verification_completed', {
        sessionId: session.id,
        parentSessionId: session.parentSessionId,
        verificationSuccess,
      });
      this.deps.analytics.track('transfer_completed', { sessionId: session.id, transferSuccess: verificationSuccess });
    } else {
      this.deps.analytics.track('guided_completed', {
        sessionId: session.id,
        problemId: problem.problemId,
        guidanceDependency: outcome.guidanceDependency,
      });
    }

    if (session.firstErrorStepId) {
      const errorStep = steps.find((s) => s.stepId === session.firstErrorStepId);
      if (errorStep) {
        const latestResultForStep = [...attempts].reverse().find((a) => a.stepId === errorStep.stepId)?.result;
        await this.deps.mistakeIntelligence.recordMistake({
          studentId: session.studentId,
          problemId: problem.problemId,
          stepId: errorStep.stepId,
          skill: errorStep.skill,
          category: this.categorizeMistake(errorStep, latestResultForStep),
          recovered: recoverySuccess,
          context: errorStep.objective,
        });
      }
    }

    await this.deps.mastery.recordEvidence({
      studentId: session.studentId,
      skill: problem.skill,
      independent: !session.solutionRevealed && stats.stepsIndependent === stats.stepsTotal,
      recoveredWithGuidance: recoverySuccess,
      solutionRevealed: session.solutionRevealed,
      verificationSuccess: verificationSuccess ?? undefined,
    });

    return outcome;
  }

  async startVerification(sessionId: string, requestingStudentId?: string): Promise<SessionView> {
    const parent = await this.requireOwnedSession(sessionId, requestingStudentId);
    if (parent.mode !== 'GUIDED') throw new InvalidRequestError('Verification can only be started from a GUIDED session.');
    if (parent.status !== 'COMPLETED') throw new InvalidRequestError('Finish guided solving before starting independent verification.');

    const problem = await this.deps.problemBank.getById(parent.problemId);
    if (!problem) throw new NotFoundError(`Problem ${parent.problemId} not found.`);
    if (problem.transferVariants.length === 0) {
      throw new InvalidRequestError(`Problem ${problem.problemId} has no transfer variant configured for verification.`);
    }
    const variant = problem.transferVariants[Math.floor(Math.random() * problem.transferVariants.length)]!;

    const now = new Date().toISOString();
    const newSession: GuidedSessionRecord = {
      id: randomUUID(),
      studentId: parent.studentId,
      problemId: parent.problemId,
      variantId: variant.variantId,
      status: 'STARTED',
      mode: 'VERIFICATION',
      currentStepIndex: 0,
      version: 0,
      firstErrorStepId: null,
      solutionRevealed: false,
      solutionRequested: false,
      reconstructionSuccess: null,
      parentSessionId: parent.id,
      startedAt: now,
      lastActivityAt: now,
      completedAt: null,
    };
    await this.deps.sessions.create(newSession);
    if (variant.steps[0]) await this.ensureStepState(newSession.id, variant.steps[0], 0);

    this.deps.analytics.track('independent_verification_started', {
      sessionId: newSession.id,
      parentSessionId: parent.id,
      variantId: variant.variantId,
    });

    return this.buildSessionView(newSession, problem, variant.steps);
  }

  async getSummary(sessionId: string, requestingStudentId?: string): Promise<SummaryView> {
    const session = await this.requireOwnedSession(sessionId, requestingStudentId);
    const outcome = await this.deps.outcomes.findBySessionId(sessionId);
    if (!outcome) throw new NotFoundError('This session has not been completed yet - call completeSession first.');

    const history = await this.deps.outcomes.listByStudent(session.studentId);
    const suggestedNextHelpLevel = recommendNextHelpLevel(history.map(toPastProblemRecord));

    return { outcome, guidanceDependencyMessage: this.phraseGuidanceDependency(outcome.guidanceDependency), suggestedNextHelpLevel };
  }

  async submitFeedback(sessionId: string, feedback: StudentFeedback, requestingStudentId?: string): Promise<void> {
    await this.requireOwnedSession(sessionId, requestingStudentId);
    if (!ALLOWED_STUDENT_FEEDBACK.includes(feedback)) throw new InvalidRequestError(`Unknown feedback value: ${feedback}`);
    const outcome = await this.deps.outcomes.findBySessionId(sessionId);
    if (!outcome) throw new NotFoundError('This session has not been completed yet.');
    await this.deps.outcomes.upsert({ ...outcome, studentFeedback: feedback });
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private async requireOwnedSession(sessionId: string, requestingStudentId?: string): Promise<GuidedSessionRecord> {
    const session = await this.deps.sessions.findById(sessionId);
    if (!session) throw new NotFoundError(`No guided session with id ${sessionId}.`);
    // Section 94/111: ownership is enforced here AND at the HTTP layer (see api/middleware/auth.ts).
    // Defense in depth - this service must never trust a caller who bypasses the middleware.
    if (requestingStudentId && session.studentId !== requestingStudentId) {
      throw new ForbiddenError('This guided session belongs to a different student.');
    }
    return session;
  }

  private assertGuidanceAllowed(session: GuidedSessionRecord): void {
    if (session.mode === 'VERIFICATION') throw new GuidanceUnavailableError();
  }

  private async loadProblemAndSteps(
    session: GuidedSessionRecord,
  ): Promise<{ problem: ProblemTemplate; steps: StepTemplate[]; title: string; promptText: string }> {
    const problem = await this.deps.problemBank.getById(session.problemId);
    if (!problem) throw new NotFoundError(`Problem ${session.problemId} referenced by session ${session.id} no longer exists.`);
    if (session.variantId) {
      const variant = problem.transferVariants.find((v) => v.variantId === session.variantId);
      if (!variant) throw new NotFoundError(`Transfer variant ${session.variantId} not found on problem ${problem.problemId}.`);
      return { problem, steps: variant.steps, title: variant.title, promptText: variant.promptText };
    }
    return { problem, steps: problem.steps, title: problem.title, promptText: problem.promptText };
  }

  private async ensureStepState(sessionId: string, step: StepTemplate, initialHelpLevel: number | undefined): Promise<GuidedStepStateRecord> {
    const existing = await this.deps.stepStates.findBySessionAndStep(sessionId, step.stepId);
    if (existing) return existing;
    const now = new Date().toISOString();
    return this.deps.stepStates.upsert({
      id: randomUUID(),
      sessionId,
      stepId: step.stepId,
      sequence: step.sequence,
      status: 'PENDING',
      helpLevel: initialHelpLevel ?? 0,
      consecutiveFailures: 0,
      skipped: false,
      independent: true,
      recoveredWithGuidance: false,
      startedAt: now,
      completedAt: null,
    });
  }

  /** All session-record mutations funnel through here so version bumping and optimistic locking are never done inconsistently. */
  private async persistSessionUpdate(session: GuidedSessionRecord, patch: Partial<GuidedSessionRecord>): Promise<GuidedSessionRecord> {
    const updated: GuidedSessionRecord = {
      ...session,
      ...patch,
      version: session.version + 1,
      lastActivityAt: new Date().toISOString(),
    };
    return this.deps.sessions.update(updated, session.version);
  }

  private async classifyAllSteps(steps: StepTemplate[], stepStates: GuidedStepStateRecord[]): Promise<StepJudgement[]> {
    const attemptsByStepId: Record<string, RecordedAttempt | undefined> = {};
    for (const state of stepStates) {
      if (state.status === 'PENDING') continue;
      const latestAttempt = (await this.deps.attempts.listForStepState(state.id)).at(-1);
      attemptsByStepId[state.stepId] = {
        result: latestAttempt?.result ?? 'INCOMPLETE',
        numericValue: latestAttempt?.numericValue ?? null,
        structuredValues: latestAttempt?.structuredValues ?? undefined,
        skipped: state.status === 'SKIPPED',
      };
    }
    return classifySteps(steps, attemptsByStepId);
  }

  private async buildSessionView(session: GuidedSessionRecord, problem: ProblemTemplate, steps: StepTemplate[]): Promise<SessionView> {
    const stepStates = await this.deps.stepStates.listForSession(session.id);
    const judgements = await this.classifyAllSteps(steps, stepStates);
    const judgementByStepId = new Map(judgements.map((j) => [j.stepId, j]));
    const stateByStepId = new Map(stepStates.map((s) => [s.stepId, s]));

    const solvingPath: SolvingPathStepView[] = steps.map((step, index) => {
      const state = stateByStepId.get(step.stepId);
      const judgement = judgementByStepId.get(step.stepId);
      let status: SolvingPathStepView['status'];
      if (state?.status === 'SKIPPED') status = 'SKIPPED';
      else if (state?.status === 'CORRECT') status = 'COMPLETED';
      else if (index === session.currentStepIndex) status = 'CURRENT';
      else status = 'UPCOMING';

      return {
        stepId: step.stepId,
        sequence: step.sequence,
        type: step.type,
        objective: step.objective,
        status,
        classification: judgement && judgement.classification !== 'PENDING' ? judgement.classification : null,
      };
    });

    const meta = session.variantId ? problem.transferVariants.find((v) => v.variantId === session.variantId)! : problem;

    return {
      sessionId: session.id,
      studentId: session.studentId,
      problemId: session.problemId,
      variantId: session.variantId,
      problemTitle: meta.title,
      problemPromptText: meta.promptText,
      problemType: problem.type,
      mode: session.mode,
      status: session.status,
      version: session.version,
      currentStepIndex: session.currentStepIndex,
      totalSteps: steps.length,
      solvingPath,
      solutionRevealed: session.solutionRevealed,
      allowsGuidance: session.mode === 'GUIDED',
    };
  }

  private buildCurrentStepView(steps: StepTemplate[], step: StepTemplate, stepState: GuidedStepStateRecord): CurrentStepView {
    return {
      stepId: step.stepId,
      sequence: step.sequence,
      totalSteps: steps.length,
      type: step.type,
      objective: step.objective,
      prompt: step.prompt,
      expectedInputType: step.expectedInputType,
      choiceOptions: step.validation.type === 'MULTIPLE_CHOICE' ? step.validation.spec.options : null,
      structuredFields:
        step.validation.type === 'STRUCTURED_FIELD_SET' ? step.validation.spec.fields.map((f) => ({ key: f.key, label: f.label })) : null,
      helpLevel: stepState.helpLevel,
      status: stepState.status,
    };
  }

  private phraseGuidanceDependency(level: 'LOW' | 'MODERATE' | 'HIGH'): string {
    // Section 46: a signal the student can act on, never a verdict on them.
    switch (level) {
      case 'LOW':
        return 'You are currently solving multi-step problems mostly on your own.';
      case 'MODERATE':
        return 'You currently benefit from step guidance on some multi-step problems.';
      case 'HIGH':
        return 'You currently benefit from more structured step guidance on multi-step problems - that typically eases with practice.';
    }
  }

  private categorizeMistake(step: StepTemplate, latestResult: StepResult | undefined): MistakeEvidence['category'] {
    if (latestResult === 'UNIT_ERROR') return 'UNIT';
    if (latestResult === 'FORMAT_ERROR') return 'INTERPRETATION';
    if (step.validation.type === 'MULTIPLE_CHOICE') return 'STRATEGY';
    if (step.validation.type === 'ALGEBRAIC_EQUIVALENCE' || step.validation.type === 'NUMERIC_TOLERANCE') return 'CALCULATION';
    if (step.validation.type === 'STRUCTURED_FIELD_SET') return 'INTERPRETATION';
    return 'STRATEGY';
  }
}
