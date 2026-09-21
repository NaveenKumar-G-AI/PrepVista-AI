import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware, requireRole, requireCollegeAccess, requireOwnershipOrRole } from '../middleware/auth';
import { validateParams, validateQuery } from '../middleware/validate';
import { idParamSchema, paginationSchema } from '@prepvista/shared';
import { NotFoundError, AuthorizationError } from '../middleware/error';
import { logger } from '../lib/logger';
import { intelligenceEngine } from '../services/intelligence';

const router = Router();

/* ---- Get Student Readiness Snapshot ---- */
router.get('/readiness/:studentId?',
  authMiddleware,
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      let targetStudentId = req.params.studentId;

      // If studentId not provided and user is student, use own
      if (!targetStudentId && req.auth!.role === 'STUDENT') {
        targetStudentId = req.user!.student!.id;
      }

      if (!targetStudentId) {
        throw new AuthorizationError('Student ID required');
      }

      // Authorization
      const isOwner = req.auth!.userId === (await prisma.student.findUnique({ where: { id: targetStudentId } }))?.userId;
      const isTPO = ['TPO', 'COLLEGE_ADMIN', 'SUPER_ADMIN'].includes(req.auth!.role);

      if (!isOwner && !isTPO) {
        throw new AuthorizationError('Access denied');
      }

      if (isTPO) {
        const student = await prisma.student.findUnique({ where: { id: targetStudentId } });
        if (!student || student.collegeId !== req.auth!.collegeId) {
          throw new AuthorizationError('Student not in your college');
        }
      }

      const readiness = await intelligenceEngine.getReadinessSnapshot(targetStudentId);

      res.json({ readiness });
    } catch (error) {
      next(error);
    }
  }
);

/* ---- Get Skill Graph ---- */
router.get('/skills/:studentId?',
  authMiddleware,
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      let targetStudentId = req.params.studentId;

      if (!targetStudentId && req.auth!.role === 'STUDENT') {
        targetStudentId = req.user!.student!.id;
      }

      if (!targetStudentId) {
        throw new AuthorizationError('Student ID required');
      }

      // Authorization
      const isOwner = req.auth!.userId === (await prisma.student.findUnique({ where: { id: targetStudentId } }))?.userId;
      const isTPO = ['TPO', 'COLLEGE_ADMIN', 'SUPER_ADMIN'].includes(req.auth!.role);

      if (!isOwner && !isTPO) {
        throw new AuthorizationError('Access denied');
      }

      if (isTPO) {
        const student = await prisma.student.findUnique({ where: { id: targetStudentId } });
        if (!student || student.collegeId !== req.auth!.collegeId) {
          throw new AuthorizationError('Student not in your college');
        }
      }

      const skillGraph = await intelligenceEngine.getSkillGraph(targetStudentId);

      res.json({ skillGraph });
    } catch (error) {
      next(error);
    }
  }
);

/* ---- Get Recommendations ---- */
router.get('/recommendations/:studentId?',
  authMiddleware,
  validateParams(idParamSchema),
  validateQuery(paginationSchema),
  async (req, res, next) => {
    try {
      let targetStudentId = req.params.studentId;

      if (!targetStudentId && req.auth!.role === 'STUDENT') {
        targetStudentId = req.user!.student!.id;
      }

      if (!targetStudentId) {
        throw new AuthorizationError('Student ID required');
      }

      // Authorization
      const isOwner = req.auth!.userId === (await prisma.student.findUnique({ where: { id: targetStudentId } }))?.userId;
      const isTPO = ['TPO', 'COLLEGE_ADMIN', 'SUPER_ADMIN'].includes(req.auth!.role);

      if (!isOwner && !isTPO) {
        throw new AuthorizationError('Access denied');
      }

      if (isTPO) {
        const student = await prisma.student.findUnique({ where: { id: targetStudentId } });
        if (!student || student.collegeId !== req.auth!.collegeId) {
          throw new AuthorizationError('Student not in your college');
        }
      }

      const { page, limit, status } = req.query;
      const where: any = { studentId: targetStudentId };
      if (status) where.status = status;

      const [recommendations, total] = await Promise.all([
        prisma.recommendation.findMany({
          where,
          orderBy: { priority: 'asc' },
          skip: ((page as number) - 1) * (limit as number),
          take: limit as number,
          include: { targetSkill: true },
        }),
        prisma.recommendation.count({ where }),
      ]);

      res.json({
        recommendations,
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

/* ---- Update Recommendation Status ---- */
router.patch('/recommendations/:id',
  authMiddleware,
  validateParams(idParamSchema),
  validateBody(z.object({ status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED']) })),
  async (req, res, next) => {
    try {
      const recommendation = await prisma.recommendation.findUnique({
        where: { id: req.params.id },
        include: { student: true },
      });

      if (!recommendation) {
        throw new NotFoundError('Recommendation');
      }

      const isOwner = req.auth!.userId === recommendation.student.userId;
      if (!isOwner) {
        throw new AuthorizationError('Not your recommendation');
      }

      const updated = await prisma.recommendation.update({
        where: { id: recommendation.id },
        data: {
          status: req.body.status,
          completedAt: req.body.status === 'COMPLETED' ? new Date() : null,
        },
      });

      res.json({ recommendation: updated });
    } catch (error) {
      next(error);
    }
  }
);

/* ---- Get Progress History ---- */
router.get('/progress/:studentId?',
  authMiddleware,
  validateParams(idParamSchema),
  validateQuery(paginationSchema),
  async (req, res, next) => {
    try {
      let targetStudentId = req.params.studentId;

      if (!targetStudentId && req.auth!.role === 'STUDENT') {
        targetStudentId = req.user!.student!.id;
      }

      if (!targetStudentId) {
        throw new AuthorizationError('Student ID required');
      }

      // Authorization
      const isOwner = req.auth!.userId === (await prisma.student.findUnique({ where: { id: targetStudentId } }))?.userId;
      const isTPO = ['TPO', 'COLLEGE_ADMIN', 'SUPER_ADMIN'].includes(req.auth!.role);

      if (!isOwner && !isTPO) {
        throw new AuthorizationError('Access denied');
      }

      if (isTPO) {
        const student = await prisma.student.findUnique({ where: { id: targetStudentId } });
        if (!student || student.collegeId !== req.auth!.collegeId) {
          throw new AuthorizationError('Student not in your college');
        }
      }

      const { page, limit } = req.query;

      const [snapshots, total] = await Promise.all([
        prisma.progressSnapshot.findMany({
          where: { studentId: targetStudentId },
          orderBy: { createdAt: 'desc' },
          skip: ((page as number) - 1) * (limit as number),
          take: limit as number,
        }),
        prisma.progressSnapshot.count({ where: { studentId: targetStudentId } }),
      ]);

      res.json({
        progress: snapshots,
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

/* ---- Get Weaknesses ---- */
router.get('/weaknesses/:studentId?',
  authMiddleware,
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      let targetStudentId = req.params.studentId;

      if (!targetStudentId && req.auth!.role === 'STUDENT') {
        targetStudentId = req.user!.student!.id;
      }

      if (!targetStudentId) {
        throw new AuthorizationError('Student ID required');
      }

      // Authorization
      const isOwner = req.auth!.userId === (await prisma.student.findUnique({ where: { id: targetStudentId } }))?.userId;
      const isTPO = ['TPO', 'COLLEGE_ADMIN', 'SUPER_ADMIN'].includes(req.auth!.role);

      if (!isOwner && !isTPO) {
        throw new AuthorizationError('Access denied');
      }

      if (isTPO) {
        const student = await prisma.student.findUnique({ where: { id: targetStudentId } });
        if (!student || student.collegeId !== req.auth!.collegeId) {
          throw new AuthorizationError('Student not in your college');
        }
      }

      const weaknesses = await intelligenceEngine.getWeaknesses(targetStudentId);

      res.json({ weaknesses });
    } catch (error) {
      next(error);
    }
  }
);

import { z } from 'zod';
export default router;