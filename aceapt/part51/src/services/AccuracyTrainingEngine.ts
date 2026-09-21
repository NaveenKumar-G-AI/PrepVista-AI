import { withStudentContext } from "../db/pool.js";
import * as sessionRepo from "../db/repositories/sessionRepo.js";
import * as attemptRepo from "../db/repositories/attemptRepo.js";
import * as profileRepo from "../db/repositories/profileRepo.js";
import { getQuestion } from "../db/repositories/fixtureRepo.js";
import { computeErrorLifecycle, detectErrorClusters, classifyRecurrenceStatus } from "../domain/errorClassification.js";
import { computeAccuracyResult } from "../domain/accuracyProfile.js";
import { computeStability } from "../domain/stability.js";
import { evaluateSpeedAccuracy, evaluateNoveltyAccuracy, evaluateAssistanceAccuracy } from "../domain/contextualSignals.js";
import { decidePolicy, type PolicyDecision } from "../policy/AccuracyTrainingPolicyEngine.js";
import { getInterventionType } from "../policy/interventionMapping.js";
import { assertTransition } from "../state/sessionStateMachine.js";
import { writeSignal } from "../outbox/outbox.js";
import { explain } from "../ai/AnthropicAccuracyAdapter.js";
import { getPorts } from "../container.js";
import { track } from "./analytics.js";
import { NotFoundError, ValidationError } from "../errors.js";
import type { PortRegistry } from "../types/ports.js";
import type { AttemptRecord } from "../types/accuracy.js";
import type { ErrorType, RecurrenceStatus } from "../types/errorTaxonomy.js";
import type { AttemptSubmission, SessionState, StartTrainingRequest } from "../types/training.js";
import type { SessionRow } from "../db/repositories/sessionRepo.js";

export interface AttemptFeedback {
  attempt: AttemptRecord;
  recurrenceStatus: RecurrenceStatus | null;
  policyDecision: PolicyDecision | null;
  message: string;
  recommendedNextState: SessionState;
  session: SessionRow;
}

export interface TrainingResultOutcome {
  beforePct: number | null;
  afterPct: number | null;
  questionsTotal: number;
  questionsCorrect: number;
  independentVerificationPassed: boolean | null;
  mainIssue: ErrorType | null;
  summaryMessage: string;
}

export interface TrainingResult {
  session: SessionRow;
  outcome: TrainingResultOutcome;
}

const TARGET_ACCURACY_PCT_DEFAULT = 90; // §55 — a sensible default; a real deployment supplies a goal-derived target.

function firstErrorStepOf(stepResults: Array<{ step: number; correct: boolean }> | null | undefined): number | null {
  if (!stepResults || stepResults.length === 0) return null;
  const failed = stepResults.find((s) => !s.correct);
  return failed ? failed.step : null;
}

/** §90-97 orchestration. AI-adapter and port dependencies are injectable for tests. */
export class AccuracyTrainingEngine {
  constructor(private readonly ports: PortRegistry = getPorts()) {}

  async startTraining(studentId: string, request: StartTrainingRequest): Promise<SessionRow> {
    if (request.questionPlan.length === 0) {
      throw new ValidationError("questionPlan must contain at least one question id");
    }
    return withStudentContext(studentId, async (client) => {
      const created = await sessionRepo.createSession(client, {
        studentId,
        trainingType: request.trainingType,
        targetSkillId: request.targetSkillId ?? null,
        targetErrorType: request.targetErrorType ?? null,
        difficulty: request.difficulty ?? "medium",
        mode: request.mode ?? "guided",
        questionPlan: request.questionPlan
      });
      assertTransition(created.status, "ACTIVE");
      const active = await sessionRepo.updateSessionState(client, created.id, {
        status: "ACTIVE",
        startedAt: new Date().toISOString()
      });
      track("accuracy_training_started", { studentId, sessionId: created.id, trainingType: request.trainingType });
      return active;
    });
  }

  async getActiveSession(studentId: string): Promise<SessionRow | null> {
    return withStudentContext(studentId, (client) => sessionRepo.getActiveSessionForStudent(client, studentId));
  }

  async getSessionDetail(studentId: string, sessionId: string) {
    return withStudentContext(studentId, async (client) => {
      const session = await sessionRepo.getSession(client, sessionId);
      if (!session || session.studentId !== studentId) throw new NotFoundError(`session ${sessionId}`);
      const attempts = await attemptRepo.getAttemptsForSession(client, sessionId);
      return { session, attempts };
    });
  }

  /**
   * Records one attempt (idempotently — §96/§134), classifies any error,
   * updates recurrence status, runs the deterministic policy engine, and
   * produces the natural-language feedback message. Always leaves the
   * session in FEEDBACK on success (§95); the caller separately calls
   * transitionSession() using the returned `recommendedNextState` (or a
   * different choice, e.g. to pause instead).
   */
  async submitAttempt(
    studentId: string,
    sessionId: string,
    sequenceNumber: number,
    submission: AttemptSubmission
  ): Promise<AttemptFeedback> {
    return withStudentContext(studentId, async (client) => {
      const session = await sessionRepo.getSession(client, sessionId);
      if (!session || session.studentId !== studentId) throw new NotFoundError(`session ${sessionId}`);

      // §96/§134 — idempotent replay: a duplicate submit at an already-recorded
      // slot returns the SAME feedback instead of creating a second attempt.
      const already = await attemptRepo.getAttemptBySequence(client, sessionId, sequenceNumber);
      if (already) {
        return this.buildFeedbackForExistingAttempt(client, studentId, session, already);
      }

      if (!["ACTIVE", "RETRY", "VERIFICATION"].includes(session.status)) {
        throw new ValidationError(`Cannot submit an attempt while session is ${session.status}`);
      }

      const hintLevel =
        submission.hintLevel ?? (await this.ports.hintIntelligence.resolveHintLevel(studentId, submission.questionId));
      const isNovel =
        submission.isNovel ?? (await this.ports.antiMemorization.resolveIsNovel(studentId, submission.questionId));
      const expectedTimeMs =
        submission.expectedTimeMs ??
        (await this.ports.speedTraining.getExpectedTimeMs(submission.skillId, submission.difficulty));

      let questionValid = submission.questionValid;
      if (questionValid === undefined) {
        const q = await getQuestion(client, submission.questionId);
        questionValid = q?.isValid ?? true; // §87 — unknown validity defaults to "valid" rather than silently discarding evidence
      }

      let errorType: ErrorType | null = submission.errorType ?? null;
      if (!submission.isCorrect && !errorType) {
        errorType = await this.ports.mistakeClassification.classify({
          isCorrect: submission.isCorrect,
          submittedAnswer: submission.submittedAnswer,
          correctAnswer: null,
          stepResults: submission.stepResults ?? null
        });
      }

      const sessionPositionPct = Math.min(100, (sequenceNumber / Math.max(1, session.questionPlan.length)) * 100);

      const inserted = await attemptRepo.insertAttemptIfAbsent(client, {
        sessionId,
        studentId,
        questionId: submission.questionId,
        skillId: submission.skillId,
        sequenceNumber,
        submittedAnswer: submission.submittedAnswer,
        isCorrect: submission.isCorrect,
        firstErrorStep: firstErrorStepOf(submission.stepResults),
        stepResults: submission.stepResults ?? null,
        errorType: submission.isCorrect ? null : errorType,
        difficulty: submission.difficulty,
        isNovel,
        hintLevel,
        responseTimeMs: submission.responseTimeMs ?? null,
        expectedTimeMs,
        selfCorrected: submission.selfCorrected ?? false,
        questionValid,
        sessionPositionPct
      });

      // Lost the race to a concurrent identical request — §134: exactly one row exists either way.
      const attempt = inserted ?? (await attemptRepo.getAttemptBySequence(client, sessionId, sequenceNumber))!;

      track("accuracy_training_attempt", { studentId, sessionId, sequenceNumber, isCorrect: attempt.isCorrect });
      track(attempt.isCorrect ? "accuracy_training_correct" : "accuracy_training_error", {
        studentId,
        sessionId,
        errorType: attempt.errorType
      });
      if (attempt.hintLevel === "independent") track("independent_accuracy_test", { studentId, isCorrect: attempt.isCorrect });
      if (attempt.isNovel) track("novel_accuracy_test", { studentId, isCorrect: attempt.isCorrect });

      let recurrenceStatus: RecurrenceStatus | null = null;
      let policyDecision: PolicyDecision | null = null;
      let message: string;

      if (!attempt.isCorrect && attempt.errorType && questionValid) {
        const skillHistory = await attemptRepo.getAttemptHistory(client, studentId, {
          skillId: submission.skillId,
          limit: 50
        });
        const lifecycle = computeErrorLifecycle(skillHistory, attempt.errorType);
        const cluster = detectErrorClusters(submission.skillId, skillHistory);
        const isPartOfCluster = Boolean(cluster?.memberErrorTypes.includes(attempt.errorType));
        recurrenceStatus = classifyRecurrenceStatus(lifecycle, isPartOfCluster);

        policyDecision = decidePolicy({
          errorType: attempt.errorType,
          recurrenceStatus,
          currentDifficulty: session.difficulty,
          lastAttemptCorrect: false,
          recentCorrectStreak: 0,
          currentRepairStage: null,
          consecutiveCorrectAtCurrentStage: 0,
          stability: computeStability([]), // per-attempt call has no multi-point series yet; completion computes the real one
          targetAccuracyPct: TARGET_ACCURACY_PCT_DEFAULT
        });

        await profileRepo.insertIntervention(client, {
          studentId,
          sessionId,
          errorType: attempt.errorType,
          skillId: submission.skillId,
          interventionType: policyDecision.interventionType!,
          reason: policyDecision.rationale,
          recurrenceStatus,
          evidence: {
            frequency: lifecycle.frequency,
            recentFrequency: lifecycle.recentFrequency,
            streak: lifecycle.streak,
            correctionRate: lifecycle.correctionRate,
            independentCorrectionRate: lifecycle.independentCorrectionRate,
            firstSeen: lifecycle.firstSeen,
            lastSeen: lifecycle.lastSeen,
            clusterId: cluster?.clusterId ?? null
          }
        });
        track("accuracy_intervention_selected", { studentId, interventionType: policyDecision.interventionType, recurrenceStatus });

        if (recurrenceStatus === "regressed") {
          await writeSignal(client, studentId, "REGRESSION_DETECTED_SIGNAL", {
            errorType: attempt.errorType,
            skillId: submission.skillId,
            reason: "Previously resolved error pattern has reappeared."
          });
        }

        message = (
          await explain({
            kind: "error_feedback",
            errorType: attempt.errorType,
            recurrenceNote:
              recurrenceStatus === "recurring" || recurrenceStatus === "clustered"
                ? `This has appeared ${lifecycle.frequency} times recently.`
                : undefined
          })
        ).message;
      } else if (!attempt.isCorrect && !questionValid) {
        // §129 — invalid question: excluded from accuracy evidence, and we tell the student plainly rather than penalizing them.
        message = "This question didn't validate correctly, so it won't count toward your accuracy — moving on.";
      } else {
        message = "Correct.";
      }

      assertTransition(session.status, "FEEDBACK");
      const updatedSession = await sessionRepo.updateSessionState(client, sessionId, {
        status: "FEEDBACK",
        cursorPosition: sequenceNumber,
        ...(policyDecision ? { difficulty: policyDecision.difficulty } : {})
      });

      const allSessionAttempts = await attemptRepo.getAttemptsForSession(client, sessionId);
      const recommendedNextState = recommendNextState(session, attempt, allSessionAttempts);

      return { attempt, recurrenceStatus, policyDecision, message, recommendedNextState, session: updatedSession };
    });
  }

  private async buildFeedbackForExistingAttempt(
    client: Parameters<typeof attemptRepo.getAttemptsForSession>[0],
    studentId: string,
    session: SessionRow,
    attempt: AttemptRecord
  ): Promise<AttemptFeedback> {
    const allSessionAttempts = await attemptRepo.getAttemptsForSession(client, session.id);
    return {
      attempt,
      recurrenceStatus: null,
      policyDecision: null,
      message: attempt.isCorrect ? "Correct." : "Already recorded.",
      recommendedNextState: recommendNextState(session, attempt, allSessionAttempts),
      session
    };
  }

  /** Validated, explicit transition. COMPLETED routes through finalizeCompletion() for the rich result payload. */
  async transitionSession(studentId: string, sessionId: string, to: SessionState): Promise<SessionRow | TrainingResult> {
    return withStudentContext(studentId, async (client) => {
      const session = await sessionRepo.getSession(client, sessionId);
      if (!session || session.studentId !== studentId) throw new NotFoundError(`session ${sessionId}`);
      assertTransition(session.status, to);

      if (to === "COMPLETED") {
        return this.finalizeCompletion(client, studentId, session);
      }
      if (to === "ABANDONED") {
        track("accuracy_training_abandoned", { studentId, sessionId });
      }
      return sessionRepo.updateSessionState(client, sessionId, { status: to });
    });
  }

  private async finalizeCompletion(
    client: Parameters<typeof attemptRepo.getAttemptsForSession>[0],
    studentId: string,
    session: SessionRow
  ): Promise<TrainingResult> {
    const attempts = await attemptRepo.getAttemptsForSession(client, session.id);
    const skillId = session.targetSkillId ?? attempts[0]?.skillId ?? null;

    const priorHistory = skillId
      ? (await attemptRepo.getAttemptHistory(client, studentId, { skillId, limit: 300 })).filter(
          (a) => a.sessionId !== session.id
        )
      : [];
    const beforeResult = computeAccuracyResult(priorHistory, "skill", skillId);
    const afterResult = computeAccuracyResult(attempts, "skill", skillId);

    const independentAttempts = attempts.filter((a) => a.hintLevel === "independent" && a.questionValid);
    const independentVerificationPassed =
      independentAttempts.length > 0 ? independentAttempts.every((a) => a.isCorrect) : null;

    if (skillId && beforeResult.accuracy != null && afterResult.accuracy != null) {
      const priorAvgMs = average(priorHistory.map((a) => a.responseTimeMs).filter((v): v is number => v != null));
      const afterAvgMs = average(attempts.map((a) => a.responseTimeMs).filter((v): v is number => v != null));
      const paceGotFaster = priorAvgMs != null && afterAvgMs != null && afterAvgMs < priorAvgMs;
      const speed = evaluateSpeedAccuracy(beforeResult.accuracy, afterResult.accuracy, paceGotFaster);
      if (speed.signal) {
        await writeSignal(client, studentId, speed.signal, { skillId, dropPts: speed.dropPts, reason: speed.reason });
        if (speed.signal === "PRESSURE_REDUCTION_SIGNAL") track("pressure_accuracy_test", { studentId, skillId });
      }
    }

    if (skillId && afterResult.accuracy != null && afterResult.independentAccuracy != null) {
      const assistance = evaluateAssistanceAccuracy(afterResult.accuracy, afterResult.independentAccuracy);
      if (assistance.signal) {
        await writeSignal(client, studentId, assistance.signal, { skillId, gapPts: assistance.gapPts, reason: assistance.reason });
      }
    }

    if (skillId && afterResult.accuracy != null && afterResult.novelAccuracy != null) {
      const novelty = evaluateNoveltyAccuracy(afterResult.accuracy, afterResult.novelAccuracy);
      if (novelty.signal) {
        await writeSignal(client, studentId, novelty.signal, { skillId, gapPts: novelty.gapPts, reason: novelty.reason });
      }
    }

    if (skillId) {
      await writeSignal(client, studentId, "MASTERY_EVIDENCE_SIGNAL", {
        skillId,
        independentAccuracy: afterResult.independentAccuracy,
        timedAccuracy: afterResult.timedAccuracy,
        novelAccuracy: afterResult.novelAccuracy,
        sampleSize: afterResult.sampleSize
      });
      await writeSignal(client, studentId, "RETENTION_EVIDENCE_SIGNAL", {
        skillId,
        accuracy: afterResult.accuracy ?? 0,
        sampleSize: afterResult.sampleSize,
        measuredAt: new Date().toISOString()
      });
      await profileRepo.insertSnapshot(client, studentId, afterResult, `session ${session.id} completion`);
    }

    const overallResult = computeAccuracyResult(await attemptRepo.getAttemptHistory(client, studentId, { limit: 300 }), "overall", null);
    const overallHistory = await profileRepo.getSnapshotHistory(client, studentId, "overall", null, 20);
    const overallSeries = overallHistory.map((h) => Number(h.accuracy)).filter((v) => !Number.isNaN(v));
    const overallStability = computeStability(overallSeries);
    await writeSignal(client, studentId, "READINESS_ACCURACY_SIGNAL", {
      overallAccuracy: overallResult.accuracy,
      independentAccuracy: overallResult.independentAccuracy,
      timedAccuracy: overallResult.timedAccuracy,
      consistency: overallStability.consistency
    });

    const summaryMessage = (
      await explain({
        kind: "training_result",
        interventionType: session.targetErrorType ? getInterventionType(session.targetErrorType) : null,
        beforePct: beforeResult.accuracy,
        afterPct: afterResult.accuracy,
        independentVerificationPassed
      })
    ).message;

    const outcome: TrainingResultOutcome = {
      beforePct: beforeResult.accuracy,
      afterPct: afterResult.accuracy,
      questionsTotal: attempts.length,
      questionsCorrect: attempts.filter((a) => a.isCorrect).length,
      independentVerificationPassed,
      mainIssue: session.targetErrorType,
      summaryMessage
    };

    const updatedSession = await sessionRepo.updateSessionState(client, session.id, {
      status: "COMPLETED",
      completedAt: new Date().toISOString(),
      outcome: outcome as unknown as Record<string, unknown>
    });

    track("accuracy_training_completed", { studentId, sessionId: session.id, ...outcome });
    return { session: updatedSession, outcome };
  }
}

/** Pure and independently testable — see tests/unit/sessionRecommendation.test.ts. */
export function recommendNextState(
  session: Pick<SessionRow, "questionPlan" | "mode">,
  lastAttempt: AttemptRecord,
  allSessionAttempts: AttemptRecord[]
): SessionState {
  if (!lastAttempt.isCorrect && lastAttempt.questionValid) return "RETRY";
  const planLength = session.questionPlan.length;
  const attemptedCount = allSessionAttempts.length;
  const hasIndependentAttempt = allSessionAttempts.some((a) => a.hintLevel === "independent");
  if (attemptedCount >= planLength) {
    return session.mode === "independent" || hasIndependentAttempt ? "COMPLETED" : "VERIFICATION";
  }
  return "ACTIVE";
}

function average(xs: number[]): number | null {
  return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
