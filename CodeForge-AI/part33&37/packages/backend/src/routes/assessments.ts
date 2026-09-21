import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware, requireRole, requireCollegeAccess, requireOwnershipOrRole } from '../middleware/auth';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { assessmentRateLimiter } from '../middleware/rateLimit';
import { createAssessmentSchema, submitAnswerSchema, idParamSchema, paginationSchema } from '@prepvista/shared';
import { NotFoundError, ValidationError, AuthorizationError } from '../middleware/error';
import { logger } from '../lib/logger';
import { aiService } from '../services/ai';
import { intelligenceEngine } from '../services/intelligence';

const router = Router();

/* ---- Create Assessment ---- */
router.post('/',
  authMiddleware,
  requireRole('STUDENT'),
  assessmentRateLimiter,
  validateBody(createAssessmentSchema),
  async (req, res, next) => {
    try {
      const { type, difficulty, targetRole, questionCount, timeLimitMinutes } = req.body;
      const studentId = req.user!.student!.id;

      // Generate questions via AI
      const questions = await aiService.generateQuestions({
        type,
        difficulty,
        targetRole,
        count: questionCount,
        studentId,
      });

      const assessment = await prisma.assessment.create({
        data: {
          studentId,
          type,
          difficulty,
          targetRole,
          questionCount,
          timeLimitMinutes,
          status: 'CREATED',
          questions: {
            create: questions.map((q, index) => ({
              questionText: q.text,
              category: q.category,
              difficulty: q.difficulty,
              expectedSkills: q.expectedSkills,
              expectedAnswer: q.expectedAnswer,
              rubric: q.rubric,
              order: index,
            })),
          },
        },
        include: {
          questions: { orderBy: { order: 'asc' } },
        },
      });

      logger.info({ assessmentId: assessment.id, studentId }, 'Assessment created');

      res.status(201).json({ assessment });
    } catch (error) {
      next(error);
    }
  }
);

/* ---- Get Assessment ---- */
router.get('/:id',
  authMiddleware,
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      const assessment = await prisma.assessment.findUnique({
        where: { id: req.params.id },
        include: {
          questions: { orderBy: { order: 'asc' } },
          student: { include: { user: true } },
        },
      });

      if (!assessment) {
        throw new NotFoundError('Assessment');
      }

      // Authorization
      const isOwner = req.auth!.userId === assessment.student.userId;
      const isTPO = ['TPO', 'COLLEGE_ADMIN', 'SUPER_ADMIN'].includes(req.auth!.role);
      const sameCollege = req.auth!.collegeId === assessment.student.collegeId;

      if (!isOwner && !(isTPO && sameCollege)) {
        throw new AuthorizationError('Access denied');
      }

      // Hide expected answers for students during assessment
      let questions = assessment.questions;
      if (isOwner && assessment.status !== 'COMPLETED' && assessment.status !== 'FAILED') {
        questions = questions.map(q => ({
          ...q,
          expectedAnswer: undefined,
          rubric: undefined,
        }));
      }

      res.json({ assessment: { ...assessment, questions } });
    } catch (error) {
      next(error);
    }
  }
);

/* ---- Start Assessment ---- */
router.post('/:id/start',
  authMiddleware,
  requireRole('STUDENT'),
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      const assessment = await prisma.assessment.findUnique({
        where: { id: req.params.id },
        include: { student: true },
      });

      if (!assessment) {
        throw new NotFoundError('Assessment');
      }

      if (assessment.student.userId !== req.auth!.userId) {
        throw new AuthorizationError('Not your assessment');
      }

      if (assessment.status !== 'CREATED') {
        throw new ValidationError('Assessment already started or completed');
      }

      const updated = await prisma.assessment.update({
        where: { id: assessment.id },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
        include: { questions: { orderBy: { order: 'asc' } } },
      });

      // Hide expected answers
      const questions = updated.questions.map(q => ({
        ...q,
        expectedAnswer: undefined,
        rubric: undefined,
      }));

      res.json({ assessment: { ...updated, questions } });
    } catch (error) {
      next(error);
    }
  }
);

/* ---- Submit Answer ---- */
router.post('/:id/answer',
  authMiddleware,
  requireRole('STUDENT'),
  validateParams(idParamSchema),
  validateBody(submitAnswerSchema),
  async (req, res, next) => {
    try {
      const { questionId, answer, timeSpentSeconds } = req.body;

      const assessment = await prisma.assessment.findUnique({
        where: { id: req.params.id },
        include: { questions: true, student: true },
      });

      if (!assessment) {
        throw new NotFoundError('Assessment');
      }

      if (assessment.student.userId !== req.auth!.userId) {
        throw new AuthorizationError('Not your assessment');
      }

      if (assessment.status !== 'IN_PROGRESS') {
        throw new ValidationError('Assessment not in progress');
      }

      const question = assessment.questions.find(q => q.id === questionId);
      if (!question) {
        throw new NotFoundError('Question');
      }

      if (question.answer) {
        throw new ValidationError('Question already answered');
      }

      // Evaluate answer via AI
      const evaluation = await aiService.evaluateAnswer({
        question: question.questionText,
        category: question.category,
        difficulty: question.difficulty,
        expectedSkills: question.expectedSkills,
        expectedAnswer: question.expectedAnswer,
        rubric: question.rubric,
        studentAnswer: answer,
        timeSpentSeconds,
      });

      // Update question with answer and score
      await prisma.assessmentQuestion.update({
        where: { id: questionId },
        data: {
          answer,
          score: evaluation.score,
          feedback: evaluation.feedback,
          timeSpentSeconds,
        },
      });

      // Check if all questions answered
      const allAnswered = assessment.questions.every(q => q.id === questionId || q.answer);

      if (allAnswered) {
        // Trigger async processing
        await prisma.assessment.update({
          where: { id: assessment.id },
          data: { status: 'PROCESSING' },
        });

        // Process in background
        intelligenceEngine.processAssessment(assessment.id).catch(err => {
          logger.error({ err, assessmentId: assessment.id }, 'Assessment processing failed');
        });
      }

      res.json({
        score: evaluation.score,
        feedback: evaluation.feedback,
        isComplete: allAnswered,
      });
    } catch (error) {
      next(error);
    }
  }
);

/* ---- List Assessments ---- */
router.get('/',
  authMiddleware,
  validateQuery(paginationSchema),
  async (req, res, next) => {
    try {
      const { page, limit, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
      const studentId = req.user?.student?.id;

      const where: any = {};
      if (req.auth!.role === 'STUDENT') {
        where.studentId = studentId;
      } else if (['TPO', 'COLLEGE_ADMIN'].includes(req.auth!.role)) {
        where.student = { collegeId: req.auth!.collegeId };
      }

      const [assessments, total] = await Promise.all([
        prisma.assessment.findMany({
          where,
          orderBy: { [sortBy as string]: sortOrder },
          skip: ((page as number) - 1) * (limit as number),
          take: limit as number,
          include: {
            student: { include: { user: { select: { name: true, email: true } } } },
          },
        }),
        prisma.assessment.count({ where }),
      ]);

      res.json({
        assessments,
        pagination: {
          page: page as number,
          limit: limit as number,
          total,
          totalPages: Math.ceil(total / (limit as number)),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/* ---- Delete Assessment ---- */
router.delete('/:id',
  authMiddleware,
  requireRole('STUDENT'),
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      const assessment = await prisma.assessment.findUnique({
        where: { id: req.params.id },
        include: { student: true },
      });

      if (!assessment) {
        throw new NotFoundError('Assessment');
      }

      if (assessment.student.userId !== req.auth!.userId) {
        throw new AuthorizationError('Not your assessment');
      }

      if (assessment.status === 'IN_PROGRESS' || assessment.status === 'PROCESSING') {
        throw new ValidationError('Cannot delete active assessment');
      }

      await prisma.assessment.delete({ where: { id: assessment.id } });

      res.json({ message: 'Assessment deleted' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;