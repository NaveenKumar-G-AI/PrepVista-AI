import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

import { resetDb } from '../db/db';
import { seed } from '../db/seed';
import { createAssessment } from '../services/assessmentGenerationService';
import { startAssessment, getOwnedAssessment } from '../services/sessionService';
import { viewQuestion, submitAnswer } from '../services/attemptService';
import { getQuestionsByIds } from '../services/questionSelectionService';
import { generateAssessmentResult } from '../services/assessmentReportService';

before(() => {
  resetDb();
  seed();
});

describe('full assessment pipeline (real SQLite, real services)', () => {
  test('answering every question correctly yields 100% accuracy and a fully-scored result', async () => {
    const studentId = 'test-student-all-correct';
    const { assessment: created } = await createAssessment(studentId, 'DIAGNOSTIC_ASSESSMENT');
    let assessment = startAssessment(created.id, studentId);
    const questions = getQuestionsByIds(assessment.questionIds);

    let previousId: string | null = null;
    for (const q of questions) {
      viewQuestion(assessment.id, studentId, q.id, previousId);
      submitAnswer(assessment.id, q.id, q.correctOptionId);
      previousId = q.id;
    }
    assessment = getOwnedAssessment(assessment.id, studentId);

    const { result } = await generateAssessmentResult(assessment.id, studentId);

    assert.equal(result.accuracyPct, 100);
    assert.equal(result.correctCount, questions.length);
    assert.equal(result.incorrectCount, 0);
    assert.equal(result.unansweredCount, 0);
    assert.equal(result.readiness.dimensions.find((d) => d.dimension === 'ACCURACY')!.score, 100);
    assert.equal(result.riskAreas.length, 0, 'a perfect run should have no risk areas');
  });

  test('answering every question incorrectly yields 0% accuracy and surfaces risk areas', async () => {
    const studentId = 'test-student-all-wrong';
    const { assessment: created } = await createAssessment(studentId, 'DIAGNOSTIC_ASSESSMENT');
    let assessment = startAssessment(created.id, studentId);
    const questions = getQuestionsByIds(assessment.questionIds);

    let previousId: string | null = null;
    for (const q of questions) {
      viewQuestion(assessment.id, studentId, q.id, previousId);
      const wrong = q.options.find((o) => o.id !== q.correctOptionId)!.id;
      submitAnswer(assessment.id, q.id, wrong);
      previousId = q.id;
    }
    assessment = getOwnedAssessment(assessment.id, studentId);

    const { result } = await generateAssessmentResult(assessment.id, studentId);

    assert.equal(result.accuracyPct, 0);
    assert.equal(result.correctCount, 0);
    assert.equal(result.incorrectCount, questions.length);
    assert.equal(result.readiness.dimensions.find((d) => d.dimension === 'ACCURACY')!.score, 0);
    // Deliberately NOT asserting state === 'NOT_READY' here: readiness is multi-dimensional by design
    // (spec section 30 explicitly rejects readiness === accuracy), and dimensions like DIFFICULTY_STABILITY
    // or QUESTION_SELECTION can legitimately stay high even at 0% accuracy (e.g. a flat 0% curve has no
    // "drop" between tiers, and no question was over-invested-then-abandoned). The meaningful assertion is
    // that overall readiness is low and in one of the two bottom bands, not pinned to one exact band.
    assert.ok(result.readiness.overallScore < 50, `expected low overall readiness, got ${result.readiness.overallScore}`);
    assert.ok(
      ['NOT_READY', 'FOUNDATION'].includes(result.readiness.state),
      `expected a bottom-band state, got ${result.readiness.state}`
    );
    assert.ok(result.riskAreas.length > 0, 'a fully wrong run should surface at least one risk area');
    assert.ok(result.recommendations.length > 0, 'a fully wrong run should still produce a next-best-action');
  });

  test('unviewed questions are counted as unanswered, not silently dropped', async () => {
    const studentId = 'test-student-partial';
    const { assessment: created } = await createAssessment(studentId, 'PROGRESS_ASSESSMENT'); // 12 questions
    let assessment = startAssessment(created.id, studentId);
    const questions = getQuestionsByIds(assessment.questionIds);
    const toAnswer = questions.slice(0, 5);

    let previousId: string | null = null;
    for (const q of toAnswer) {
      viewQuestion(assessment.id, studentId, q.id, previousId);
      submitAnswer(assessment.id, q.id, q.correctOptionId);
      previousId = q.id;
    }
    assessment = getOwnedAssessment(assessment.id, studentId);

    const { result } = await generateAssessmentResult(assessment.id, studentId);

    assert.equal(result.attemptedCount, 5);
    assert.equal(result.unansweredCount, questions.length - 5);
    assert.equal(result.correctCount, 5);
  });

  test("a student cannot read another student's assessment (ownership check)", async () => {
    const owner = 'test-student-owner';
    const intruder = 'test-student-intruder';
    const { assessment } = await createAssessment(owner, 'DIAGNOSTIC_ASSESSMENT');

    assert.throws(() => getOwnedAssessment(assessment.id, intruder), /does not belong/);
  });
});
