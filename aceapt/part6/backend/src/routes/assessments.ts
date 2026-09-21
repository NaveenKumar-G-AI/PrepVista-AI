import { Router } from 'express';
import { z } from 'zod';
import { Assessment, QuestionForClient } from '../domain/types';
import { asyncRoute } from '../middleware/errorHandler';
import { createAssessment } from '../services/assessmentGenerationService';
import {
  abandonAssessment,
  checkExpiry,
  getOwnedAssessment,
  markSubmitted,
  requireInProgress,
  startAssessment,
} from '../services/sessionService';
import { getAllAttempts, getAttempt, skipQuestion, submitAnswer, viewQuestion } from '../services/attemptService';
import { getQuestionsByIds } from '../services/questionSelectionService';
import { remainingSeconds } from '../services/timerService';
import { generateAssessmentResult, getStoredResult } from '../services/assessmentReportService';
import { getAssessmentHistory } from '../services/historyService';
import { getDb, fromJson } from '../db/db';

export const assessmentsRouter = Router();

const TOPIC_ENUM = z.enum([
  'ARITHMETIC', 'ALGEBRA', 'DATA_INTERPRETATION',
  'ANALYTICAL_REASONING', 'PATTERNS_SERIES', 'GRAMMAR', 'READING_COMPREHENSION',
]);
const TYPE_ENUM = z.enum([
  'DIAGNOSTIC_ASSESSMENT', 'PROGRESS_ASSESSMENT', 'MASTERY_ASSESSMENT', 'MIXED_APTITUDE_ASSESSMENT',
  'TIMED_ASSESSMENT', 'FULL_MOCK_ASSESSMENT', 'READINESS_ASSESSMENT', 'FINAL_READINESS_CHECK',
]);

const createSchema = z.object({ type: TYPE_ENUM, focusTopics: z.array(TOPIC_ENUM).optional() });
const navigateSchema = z.object({ questionId: z.string().min(1) });
const attemptSchema = z.object({ questionId: z.string().min(1), optionId: z.string().min(1) });
const skipSchema = z.object({ questionId: z.string().min(1) });

function toClientQuestion(assessment: Assessment, questionId: string): QuestionForClient | null {
  const [q] = getQuestionsByIds([questionId]);
  if (!q) return null;
  const position = assessment.questionIds.indexOf(questionId) + 1;
  // Deliberately excludes domain/topic/skill/difficulty/correctOptionId/explanation - section 10.
  return {
    id: q.id,
    position,
    prompt: q.prompt,
    context: q.context,
    options: q.options,
    expectedTimeSeconds: q.expectedTimeSeconds,
  };
}

function stateResponse(assessment: Assessment) {
  const attempts = getAllAttempts(assessment.id);
  const answeredCount = attempts.filter((a) => a.finalAnswer !== null).length;
  const skippedCount = attempts.filter((a) => a.skipped).length;
  const currentQuestion = assessment.currentQuestionId ? toClientQuestion(assessment, assessment.currentQuestionId) : null;
  const answeredIds = new Set(attempts.filter((a) => a.finalAnswer !== null).map((a) => a.questionId));
  const skippedIds = new Set(attempts.filter((a) => a.skipped).map((a) => a.questionId));

  return {
    assessment: {
      id: assessment.id,
      type: assessment.type,
      status: assessment.status,
      durationSeconds: assessment.durationSeconds,
      questionCount: assessment.questionIds.length,
      formLabel: assessment.formLabel,
      createdAt: assessment.createdAt,
      startedAt: assessment.startedAt,
    },
    remainingSeconds: remainingSeconds(assessment),
    progress: { answered: answeredCount, skipped: skippedCount, total: assessment.questionIds.length },
    currentQuestion,
    // The student's own prior selection for the CURRENT question only (not other questions, and never
    // correctness) - so revisiting a question you've already answered shows what you picked.
    selectedOptionId: assessment.currentQuestionId ? getAttempt(assessment.id, assessment.currentQuestionId)?.finalAnswer ?? null : null,
    // Opaque id/position roadmap only - no prompt/topic/difficulty/answer content - so the client can
    // render Next/Previous/jump-to-N navigation without ever seeing another question's content early.
    questionOrder: assessment.questionIds.map((id, i) => ({
      id,
      position: i + 1,
      answered: answeredIds.has(id),
      skipped: skippedIds.has(id) && !answeredIds.has(id),
    })),
  };
}

// POST /api/assessments
assessmentsRouter.post(
  '/',
  asyncRoute(async (req, res) => {
    const body = createSchema.parse(req.body ?? {});
    const { assessment, warnings } = await createAssessment(req.studentId, body.type, { focusTopics: body.focusTopics });
    res.status(201).json({
      assessment: {
        id: assessment.id,
        type: assessment.type,
        status: assessment.status,
        durationSeconds: assessment.durationSeconds,
        questionCount: assessment.questionIds.length,
        formLabel: assessment.formLabel,
        createdAt: assessment.createdAt,
      },
      warnings,
    });
  })
);

// GET /api/assessments/history  (must be registered before /:id routes)
assessmentsRouter.get(
  '/history',
  asyncRoute(async (req, res) => {
    res.json({ history: getAssessmentHistory(req.studentId) });
  })
);

// GET /api/assessments/recommendation
assessmentsRouter.get(
  '/recommendation',
  asyncRoute(async (req, res) => {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT assessment_id FROM assessment_results WHERE student_id = ? ORDER BY scored_at DESC LIMIT 1`
      )
      .get(req.studentId) as { assessment_id: string } | undefined;

    if (!row) {
      res.json({ available: false, message: 'No completed assessments yet - complete one to get a personalized recommendation.' });
      return;
    }
    const result = getStoredResult(row.assessment_id, req.studentId);
    if (!result || result.recommendations.length === 0) {
      res.json({ available: false, message: 'No specific recommendation from the most recent assessment.' });
      return;
    }
    const practiceRow = db
      .prepare(`SELECT id, status FROM practice_sessions WHERE source_assessment_id = ? ORDER BY created_at DESC LIMIT 1`)
      .get(row.assessment_id) as { id: string; status: string } | undefined;

    res.json({
      available: true,
      sourceAssessmentId: row.assessment_id,
      recommendation: result.recommendations[0],
      allRecommendations: result.recommendations,
      practiceSession: practiceRow ? { id: practiceRow.id, status: practiceRow.status } : null,
    });
  })
);

// GET /api/assessments/:id
assessmentsRouter.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const assessment = checkExpiry(req.params.id, req.studentId);
    res.json(stateResponse(assessment));
  })
);

// POST /api/assessments/:id/start
assessmentsRouter.post(
  '/:id/start',
  asyncRoute(async (req, res) => {
    let assessment = startAssessment(req.params.id, req.studentId);
    if (assessment.currentQuestionId) {
      viewQuestion(assessment.id, req.studentId, assessment.currentQuestionId, null);
      assessment = getOwnedAssessment(assessment.id, req.studentId);
    }
    res.json(stateResponse(assessment));
  })
);

// POST /api/assessments/:id/navigate
assessmentsRouter.post(
  '/:id/navigate',
  asyncRoute(async (req, res) => {
    const body = navigateSchema.parse(req.body ?? {});
    let assessment = checkExpiry(req.params.id, req.studentId);
    requireInProgress(assessment);
    if (!assessment.questionIds.includes(body.questionId)) {
      res.status(400).json({ error: 'INVALID_QUESTION', message: 'That question is not part of this assessment.' });
      return;
    }
    viewQuestion(assessment.id, req.studentId, body.questionId, assessment.currentQuestionId);
    assessment = getOwnedAssessment(assessment.id, req.studentId);
    res.json(stateResponse(assessment));
  })
);

// POST /api/assessments/:id/attempt
assessmentsRouter.post(
  '/:id/attempt',
  asyncRoute(async (req, res) => {
    const body = attemptSchema.parse(req.body ?? {});
    const assessment = checkExpiry(req.params.id, req.studentId);
    requireInProgress(assessment);
    if (!assessment.questionIds.includes(body.questionId)) {
      res.status(400).json({ error: 'INVALID_QUESTION', message: 'That question is not part of this assessment.' });
      return;
    }
    const [question] = getQuestionsByIds([body.questionId]);
    if (!question || !question.options.some((o) => o.id === body.optionId)) {
      res.status(400).json({ error: 'INVALID_OPTION', message: 'That option does not exist for this question.' });
      return;
    }
    // No hints/correctness are ever returned here - section 14.
    submitAnswer(assessment.id, body.questionId, body.optionId);
    res.json(stateResponse(assessment));
  })
);

// POST /api/assessments/:id/skip
assessmentsRouter.post(
  '/:id/skip',
  asyncRoute(async (req, res) => {
    const body = skipSchema.parse(req.body ?? {});
    const assessment = checkExpiry(req.params.id, req.studentId);
    requireInProgress(assessment);
    if (!assessment.questionIds.includes(body.questionId)) {
      res.status(400).json({ error: 'INVALID_QUESTION', message: 'That question is not part of this assessment.' });
      return;
    }
    skipQuestion(assessment.id, body.questionId);
    res.json(stateResponse(assessment));
  })
);

// POST /api/assessments/:id/submit
assessmentsRouter.post(
  '/:id/submit',
  asyncRoute(async (req, res) => {
    let assessment = checkExpiry(req.params.id, req.studentId);
    if (assessment.status === 'IN_PROGRESS') {
      assessment = markSubmitted(assessment.id, req.studentId);
    }
    if (assessment.status !== 'SUBMITTED' && assessment.status !== 'EXPIRED' && assessment.status !== 'COMPLETED') {
      res.status(409).json({ error: 'INVALID_STATE', message: `Cannot submit an assessment in status ${assessment.status}.` });
      return;
    }
    const outcome = await generateAssessmentResult(assessment.id, req.studentId);
    res.json(outcome);
  })
);

// GET /api/assessments/:id/result
assessmentsRouter.get(
  '/:id/result',
  asyncRoute(async (req, res) => {
    const assessment = checkExpiry(req.params.id, req.studentId);
    let result = getStoredResult(assessment.id, req.studentId);
    if (!result) {
      if (assessment.status === 'IN_PROGRESS' || assessment.status === 'NOT_STARTED') {
        res.status(409).json({ error: 'NOT_SUBMITTED', message: 'This assessment has not been submitted yet.' });
        return;
      }
      // EXPIRED or otherwise submitted-but-unscored - never lose the attempt (section 57).
      const outcome = await generateAssessmentResult(assessment.id, req.studentId);
      result = outcome.result;
    }
    res.json({ result });
  })
);

// GET /api/assessments/:id/readiness
assessmentsRouter.get(
  '/:id/readiness',
  asyncRoute(async (req, res) => {
    const assessment = checkExpiry(req.params.id, req.studentId);
    let result = getStoredResult(assessment.id, req.studentId);
    if (!result) {
      if (assessment.status === 'IN_PROGRESS' || assessment.status === 'NOT_STARTED') {
        res.status(409).json({ error: 'NOT_SUBMITTED', message: 'This assessment has not been submitted yet.' });
        return;
      }
      const outcome = await generateAssessmentResult(assessment.id, req.studentId);
      result = outcome.result;
    }
    res.json({ readiness: result.readiness });
  })
);

// POST /api/assessments/:id/abandon
assessmentsRouter.post(
  '/:id/abandon',
  asyncRoute(async (req, res) => {
    const assessment = abandonAssessment(req.params.id, req.studentId);
    res.json({ assessment: { id: assessment.id, status: assessment.status } });
  })
);
