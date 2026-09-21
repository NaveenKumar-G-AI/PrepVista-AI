import { randomUUID } from "node:crypto";
import { ConfidenceLevel, Difficulty, ErrorCategory, MasteryState, PracticeMode, PracticeObjective, QuestionType, RelativeSpeed, SessionStatus } from "../domain/enums";
import { Attempt, PracticeSession, Question } from "../domain/types";
import { StudentRepository } from "../repositories/catalogRepository";
import { QuestionRepository } from "../repositories/questionRepository";
import { SkillStateRepository } from "../repositories/skillStateRepository";
import { SessionRepository } from "../repositories/sessionRepository";
import { AttemptRepository } from "../repositories/attemptRepository";
import { decideNextDifficulty } from "../engines/difficultyEngine";
import { classifyError } from "../engines/errorClassifier";
import { classifyConfidenceCalibration, computeRelativeSpeed, foldAttemptIntoState, interpretPerformance } from "../engines/signals";
import { assessMastery } from "../engines/mastery";

export const DEMO_STUDENT_ID = "demo-student";

interface ScriptStep {
  correct: boolean;
  speed: RelativeSpeed;
  forceMisconception?: ErrorCategory;
  hintsUsed?: number;
  confidence?: ConfidenceLevel;
}

function pickQuestion(skillId: string, targetDifficulty: Difficulty, excludeIds: string[], needsMisconception?: ErrorCategory): Question | null {
  const pool = QuestionRepository.findCandidates({ skillId, excludeQuestionIds: excludeIds });
  const relevant = needsMisconception ? pool.filter((q) => q.options.some((o) => o.misconception === needsMisconception)) : pool;
  const searchIn = relevant.length > 0 ? relevant : pool;
  if (searchIn.length === 0) return null;
  return searchIn.reduce((best, q) => (Math.abs(q.difficulty.level - targetDifficulty) < Math.abs(best.difficulty.level - targetDifficulty) ? q : best), searchIn[0]);
}

function speedMultiplierFor(speed: RelativeSpeed): number {
  if (speed === RelativeSpeed.FAST) return 0.5;
  if (speed === RelativeSpeed.SLOW) return 1.7;
  return 1.0;
}

/** Replays a script of attempts through the real difficulty/error/mastery engines so the
 * seeded demo state is exactly what the live system would have produced — not hand-set numbers. */
function simulateHistory(studentId: string, skillId: string, script: ScriptStep[], sessionLabel: string) {
  const state = SkillStateRepository.getOrCreate(studentId, skillId);
  const sessionId = randomUUID();
  const questionsServed: string[] = [];
  const attemptIds: string[] = [];
  let usedQuestionIds: string[] = [];

  for (const step of script) {
    // Mirror production's within-session exclusion (serveNextQuestion excludes
    // session.questionsServed) so the seed history doesn't hammer one question
    // just because difficulty drifted past what the pool has at that exact level.
    let question = pickQuestion(skillId, state.currentDifficulty, usedQuestionIds, step.correct ? undefined : step.forceMisconception);
    if (!question) {
      // Pool exhausted at this difficulty band — allow reuse rather than
      // dropping the script step, same graceful fallback serveNextQuestion uses.
      question = pickQuestion(skillId, state.currentDifficulty, [], step.correct ? undefined : step.forceMisconception);
    }
    if (!question) continue;
    usedQuestionIds.push(question.id);
    questionsServed.push(question.id);

    const expectedTimeMs = question.expectedTimeSeconds * 1000;
    const totalTimeMs = Math.round(expectedTimeMs * speedMultiplierFor(step.speed));

    let selectedOptionId: string | null;
    if (step.correct) {
      selectedOptionId = question.options.find((o) => o.isCorrect)!.id;
    } else {
      const forced = step.forceMisconception ? question.options.find((o) => o.misconception === step.forceMisconception) : null;
      selectedOptionId = (forced ?? question.options.find((o) => !o.isCorrect))!.id;
    }

    const relativeSpeed = computeRelativeSpeed(totalTimeMs, expectedTimeMs, state.averageTimeSeconds);
    let errorCategory: ErrorCategory | null = null;
    if (!step.correct) {
      errorCategory = classifyError({
        question,
        selectedOptionId,
        relativeSpeed,
        totalTimeMs,
        expectedTimeMs,
        hintsUsed: step.hintsUsed ?? 0,
      }).category;
    }
    const { interpretation } = interpretPerformance(step.correct, relativeSpeed);

    const attempt: Attempt = {
      id: randomUUID(),
      studentId,
      sessionId,
      questionId: question.id,
      skillId,
      selectedOptionId,
      isCorrect: step.correct,
      timeToStartMs: Math.round(totalTimeMs * 0.1),
      totalTimeMs,
      expectedTimeMs,
      relativeSpeed,
      hintsUsed: step.hintsUsed ?? 0,
      confidence: step.confidence ?? null,
      errorCategory,
      performanceInterpretation: interpretation,
      difficultyAtAttempt: question.difficulty,
      questionIndexInSession: questionsServed.length,
      createdAt: new Date(Date.now() - (script.length - questionsServed.length) * 86_400_000).toISOString(),
    };
    AttemptRepository.insert(attempt);
    QuestionRepository.recordExposure(studentId, question.id, step.correct);
    attemptIds.push(attempt.id);

    Object.assign(state, foldAttemptIntoState(state, attempt));
    if (step.confidence) state.confidenceCalibration = classifyConfidenceCalibration(step.confidence, step.correct);

    const recentHistory = AttemptRepository.recentForSkill(studentId, skillId, 6).filter((a) => a.id !== attempt.id);
    // Same fix as practiceOrchestrator.submitAttempt: step from the actual
    // served difficulty, not a target that may be below/above what the pool has.
    const decision = decideNextDifficulty(attempt.difficultyAtAttempt.level, attempt, recentHistory);
    state.currentDifficulty = decision.nextDifficulty;

    const recentForMastery = AttemptRepository.recentForSkill(studentId, skillId, 15);
    const qTypeMap = new Map(recentForMastery.map((a) => [a.questionId, QuestionRepository.get(a.questionId)?.questionType]).filter(([, t]) => !!t) as [string, QuestionType][]);
    const availableTypes = QuestionRepository.availableQuestionTypesForSkill(skillId, [QuestionType.APPLICATION, QuestionType.TRANSFER]);
    state.masteryState = assessMastery(state, recentForMastery, qTypeMap, {
      skillHasApplicationContent: availableTypes.has(QuestionType.APPLICATION),
      skillHasTransferContent: availableTypes.has(QuestionType.TRANSFER),
    }).state;

    SkillStateRepository.save(state);
  }

  const session: PracticeSession = {
    id: sessionId,
    studentId,
    mode: PracticeMode.MIXED_PRACTICE,
    objective: PracticeObjective.MAINTAIN_SKILL,
    objectiveReason: sessionLabel,
    skillFocus: [skillId],
    plan: [{ questionType: QuestionType.MIXED, count: script.length }],
    planIndex: 0,
    questionsServed,
    attempts: attemptIds,
    currentDifficulty: state.currentDifficulty,
    status: SessionStatus.COMPLETED,
    startedAt: new Date(Date.now() - script.length * 86_400_000).toISOString(),
    completedAt: new Date(Date.now() - 86_400_000).toISOString(),
    adaptationLog: [],
    currentQuestionServedAt: null,
    currentQuestionHintsUsed: 0,
  };
  SessionRepository.create(session);
}

/**
 * §49 demo script, reproduced faithfully:
 *   STRONG: Basic Arithmetic (SK_PCT_BASIC)
 *   WEAK: Percentage Application (SK_PCT_APPLICATION)
 *   SLOW: Multi-step Problems (SK_MULTISTEP)
 * See README "Reproducing the §49 demo script" for how to drive the live
 * session so it hits the exact Medium → Medium+ → Hard(calc-error) beat.
 */
export function seedDemoStudent() {
  StudentRepository.ensure(DEMO_STUDENT_ID, "Demo Student");

  // STRONG — 9/10, mostly fast, ends around Medium+.
  simulateHistory(
    DEMO_STUDENT_ID,
    "SK_PCT_BASIC",
    [
      { correct: true, speed: RelativeSpeed.FAST },
      { correct: true, speed: RelativeSpeed.FAST },
      { correct: true, speed: RelativeSpeed.FAST },
      { correct: false, speed: RelativeSpeed.FAST, forceMisconception: ErrorCategory.CALCULATION_ERROR },
      { correct: true, speed: RelativeSpeed.FAST },
      { correct: true, speed: RelativeSpeed.ON_PACE },
      { correct: true, speed: RelativeSpeed.FAST },
      { correct: true, speed: RelativeSpeed.FAST },
      { correct: true, speed: RelativeSpeed.ON_PACE },
      { correct: true, speed: RelativeSpeed.FAST },
    ],
    "Historical practice — basic percentage calculation"
  );

  // WEAK — ~56% accuracy, mixed errors including the classic inverse-comparison CONCEPT_GAP.
  simulateHistory(
    DEMO_STUDENT_ID,
    "SK_PCT_APPLICATION",
    [
      { correct: true, speed: RelativeSpeed.FAST },
      { correct: false, speed: RelativeSpeed.ON_PACE, forceMisconception: ErrorCategory.CONCEPT_GAP },
      { correct: false, speed: RelativeSpeed.SLOW, forceMisconception: ErrorCategory.CALCULATION_ERROR },
      { correct: true, speed: RelativeSpeed.ON_PACE },
      { correct: false, speed: RelativeSpeed.SLOW, forceMisconception: ErrorCategory.CONCEPT_GAP },
      { correct: true, speed: RelativeSpeed.FAST },
      { correct: false, speed: RelativeSpeed.ON_PACE, forceMisconception: ErrorCategory.PROCEDURAL_ERROR },
      { correct: true, speed: RelativeSpeed.ON_PACE },
      { correct: true, speed: RelativeSpeed.ON_PACE },
    ],
    "Historical practice — percentage application"
  );

  // DISCOUNT — light touch, solid.
  simulateHistory(
    DEMO_STUDENT_ID,
    "SK_PCT_DISCOUNT",
    [
      { correct: true, speed: RelativeSpeed.ON_PACE },
      { correct: true, speed: RelativeSpeed.FAST },
      { correct: false, speed: RelativeSpeed.ON_PACE, forceMisconception: ErrorCategory.CONCEPT_GAP },
      { correct: true, speed: RelativeSpeed.ON_PACE },
    ],
    "Historical practice — discount problems"
  );

  // PROFIT & LOSS — light touch.
  simulateHistory(
    DEMO_STUDENT_ID,
    "SK_PCT_PROFIT_LOSS",
    [
      { correct: true, speed: RelativeSpeed.ON_PACE },
      { correct: false, speed: RelativeSpeed.SLOW, forceMisconception: ErrorCategory.CONCEPT_GAP },
      { correct: true, speed: RelativeSpeed.ON_PACE },
    ],
    "Historical practice — profit & loss"
  );

  // SLOW — accurate (~83%) but consistently well over expected time.
  simulateHistory(
    DEMO_STUDENT_ID,
    "SK_MULTISTEP",
    [
      { correct: true, speed: RelativeSpeed.SLOW },
      { correct: true, speed: RelativeSpeed.SLOW },
      { correct: false, speed: RelativeSpeed.SLOW, forceMisconception: ErrorCategory.CALCULATION_ERROR },
      { correct: true, speed: RelativeSpeed.SLOW },
      { correct: true, speed: RelativeSpeed.ON_PACE },
      { correct: true, speed: RelativeSpeed.SLOW },
    ],
    "Historical practice — multi-step problems"
  );
}
