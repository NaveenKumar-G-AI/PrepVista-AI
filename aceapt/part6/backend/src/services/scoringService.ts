import { AttemptRecord, Question } from '../domain/types';
import { getBlueprint } from '../config/blueprints';
import { DIFFICULTY_SCORE_WEIGHT } from '../config/difficultyNorms';
import { getAllAttempts, persistCorrectness, updateExposureAfterScoring } from './attemptService';
import { getQuestionsByIds } from './questionSelectionService';
import { getOwnedAssessment } from './sessionService';

export interface ScoredAttempt {
  question: Question;
  attempt: AttemptRecord;
  answered: boolean;
  correct: boolean;
}

export interface ScoringSummary {
  scoredAttempts: ScoredAttempt[];
  rawScore: number;
  maxScore: number;
  accuracyPct: number;
  attemptedCount: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
}

/**
 * Computes correctness and the raw score entirely server-side, from the
 * questions' answer keys and the persisted final_answer per attempt.
 * Idempotent: safe to call more than once for the same assessment (e.g. if
 * called from both an explicit submit and an expiry auto-submit path).
 */
export function scoreAssessment(assessmentId: string, studentId: string): ScoringSummary {
  const assessment = getOwnedAssessment(assessmentId, studentId);
  const blueprint = getBlueprint(assessment.type);
  const questions = getQuestionsByIds(assessment.questionIds);
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const attempts = getAllAttempts(assessmentId);
  const attemptByQuestion = new Map(attempts.map((a) => [a.questionId, a]));

  const scoredAttempts: ScoredAttempt[] = assessment.questionIds.map((qid) => {
    const question = questionById.get(qid) as Question;
    const attempt: AttemptRecord =
      attemptByQuestion.get(qid) ??
      ({
        assessmentId,
        questionId: qid,
        firstViewedAt: null,
        firstAnsweredAt: null,
        firstAnswer: null,
        finalAnswer: null,
        answerChangeCount: 0,
        correct: null,
        timeSpentMs: 0,
        skipped: false,
        revisited: false,
        visitCount: 0,
        navigationLog: [],
      } satisfies AttemptRecord);

    const answered = attempt.finalAnswer !== null;
    const correct = answered && attempt.finalAnswer === question.correctOptionId;
    return { question, attempt, answered, correct };
  });

  const weightFor = (q: Question) =>
    blueprint.scoringRule === 'DIFFICULTY_WEIGHTED' ? DIFFICULTY_SCORE_WEIGHT[q.difficulty] : 1;

  const maxScore = scoredAttempts.reduce((s, sa) => s + weightFor(sa.question), 0);
  const rawScore = scoredAttempts.reduce((s, sa) => s + (sa.correct ? weightFor(sa.question) : 0), 0);

  const attemptedCount = scoredAttempts.filter((sa) => sa.answered).length;
  const correctCount = scoredAttempts.filter((sa) => sa.correct).length;
  const incorrectCount = attemptedCount - correctCount;
  const unansweredCount = scoredAttempts.length - attemptedCount;
  const accuracyPct = scoredAttempts.length > 0 ? round1((correctCount / scoredAttempts.length) * 100) : 0;

  // Persist correctness + roll it into exposure tracking (section 12).
  persistCorrectness(
    assessmentId,
    scoredAttempts.map((sa) => ({ questionId: sa.question.id, correct: sa.correct }))
  );
  updateExposureAfterScoring(
    studentId,
    scoredAttempts.map((sa) => ({ questionId: sa.question.id, correct: sa.correct }))
  );

  return {
    scoredAttempts,
    rawScore: round1(rawScore),
    maxScore: round1(maxScore),
    accuracyPct,
    attemptedCount,
    correctCount,
    incorrectCount,
    unansweredCount,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
