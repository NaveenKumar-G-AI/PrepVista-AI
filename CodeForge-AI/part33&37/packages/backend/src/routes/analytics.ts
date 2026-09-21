import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware, requireRole, requireCollegeAccess } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import { paginationSchema } from '@prepvista/shared';
import { NotFoundError, AuthorizationError } from '../middleware/error';
import { logger } from '../lib/logger';

const router = Router();

/* ---- College Overview Dashboard ---- */
router.get('/college/overview',
  authMiddleware,
  requireRole('TPO', 'COLLEGE_ADMIN', 'SUPER_ADMIN'),
  requireCollegeAccess,
  async (req, res, next) => {
    try {
      const collegeId = req.auth!.collegeId!;

      const [
        totalStudents,
        activeStudents,
        avgReadinessResult,
        recentAssessments,
        topWeaknesses,
        completionRateResult,
      ] = await Promise.all([
        prisma.student.count({ where: { collegeId, isActive: true } }),
        prisma.student.count({
          where: {
            collegeId,
            isActive: true,
            assessments: { some: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
          },
        }),
        prisma.progressSnapshot.aggregate({
          where: { student: { collegeId } },
          _avg: { overallReadiness: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        }),
        prisma.assessment.count({
          where: { student: { collegeId }, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        }),
        prisma.skillEvidence.groupBy({
          by: ['skillId'],
          where: {
            student: { collegeId },
            score: { lt: 0 },
            confidence: { in: ['HIGH', 'MEDIUM'] },
          },
          _count: { skillId: true },
          _avg: { score: true },
          orderBy: { _count: { skillId: 'desc' } },
          take: 10,
        }),
        prisma.assessment.aggregate({
          where: {
            student: { collegeId },
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
          _count: { id: true },
        }),
      ]);

      // Get skill details for top weaknesses
      const weaknessSkillIds = topWeaknesses.map(w => w.skillId);
      const skills = await prisma.skill.findMany({
        where: { id: { in: weaknessSkillIds } },
      });

      const skillMap = new Map(skills.map(s => [s.id, s]));

      // Readiness distribution
      const snapshots = await prisma.progressSnapshot.findMany({
        where: { student: { collegeId } },
        distinct: ['studentId'],
        orderBy: { createdAt: 'desc' },
        take: totalStudents,
        select: { overallReadiness: true },
      });

      const distribution = {
        '0-20': 0, '20-40': 0, '40-60': 0, '60-80': 0, '80-100': 0,
      };
      snapshots.forEach(s => {
        const score = s.overallReadiness;
        if (score < 20) distribution['0-20']++;
        else if (score < 40) distribution['20-40']++;
        else if (score < 60) distribution['40-60']++;
        else if (score < 80) distribution['60-80']++;
        else distribution['80-100']++;
      });

      res.json({
        overview: {
          totalStudents,
          activeStudents,
          avgReadiness: Math.round(avgReadinessResult._avg.overallReadiness || 0),
          recentAssessments,
          completionRate: totalStudents > 0 ? Math.round((completionRateResult._count.id / totalStudents) * 100) : 0,
          readinessDistribution: distribution,
          topWeaknesses: topWeaknesses.map(w => ({
            skill: skillMap.get(w.skillId)?.name || 'Unknown',
            category: skillMap.get(w.skillId)?.category || 'Unknown',
            affectedStudents: w._count.skillId,
            avgSeverity: Math.round(Math.abs(w._avg.score || 0) * 100),
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/* ---- Student List with Filters ---- */
router.get('/college/students',
  authMiddleware,
  requireRole('TPO', 'COLLEGE_ADMIN', 'SUPER_ADMIN'),
  requireCollegeAccess,
  validateQuery(paginationSchema.extend({
    department: z.string().optional(),
    readinessMin: z.coerce.number().min(0).max(100).optional(),
    readinessMax: z.coerce.number().min(0).max(100).optional(),
    hasAssessment: z.coerce.boolean().optional(),
  })),
  async (req, res, next) => {
    try {
      const collegeId = req.auth!.collegeId!;
      const { page, limit, department, readinessMin, readinessMax, hasAssessment, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

      const where: any = { collegeId, isActive: true };

      if (department) where.department = department;

      // For readiness filters, we need to join with latest progress snapshot
      // This is a simplified version - in production, use a materialized view
      const students = await prisma.student.findMany({
        where,
        orderBy: { [sortBy as string]: sortOrder },
        skip: ((page as number) - 1) * (limit as number),
        take: limit as number,
        include: {
          user: { select: { name: true, email: true } },
          progressSnapshots: { orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { assessments: true } },
        },
      });

      // Filter by readiness in memory (for simplicity)
      let filtered = students;
      if (readinessMin !== undefined || readinessMax !== undefined) {
        filtered = students.filter(s => {
          const readiness = s.progressSnapshots[0]?.overallReadiness ?? 0;
          if (readinessMin !== undefined && readiness < readinessMin) return false;
          if (readinessMax !== undefined && readiness > readinessMax) return false;
          return true;
        });
      }

      if (hasAssessment !== undefined) {
        filtered = filtered.filter(s => {
          const hasAssessments = s._count.assessments > 0;
          return hasAssessment ? hasAssessments : !hasAssessments;
        });
      }

      const total = await prisma.student.count({ where });

      res.json({
        students: filtered.map(s => ({
          id: s.id,
          studentId: s.studentId,
          name: s.user.name,
          email: s.user.email,
          department: s.department,
          targetRole: s.targetRole,
          readiness: s.progressSnapshots[0]?.overallReadiness ?? 0,
          assessmentsCompleted: s._count.assessments,
          lastActive: s.progressSnapshots[0]?.createdAt ?? s.createdAt,
        })),
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

/* ---- Department-wise Analytics ---- */
router.get('/college/departments',
  authMiddleware,
  requireRole('TPO', 'COLLEGE_ADMIN', 'SUPER_ADMIN'),
  requireCollegeAccess,
  async (req, res, next) => {
    try {
      const collegeId = req.auth!.collegeId!;

      const departments = await prisma.student.groupBy({
        by: ['department'],
        where: { collegeId, isActive: true, department: { not: null } },
        _count: { department: true },
      });

      const deptAnalytics = await Promise.all(
        departments.map(async (dept) => {
          const students = await prisma.student.findMany({
            where: { collegeId, department: dept.department, isActive: true },
            include: { progressSnapshots: { orderBy: { createdAt: 'desc' }, take: 1 } },
          });

          const avgReadiness = students.reduce((sum, s) => sum + (s.progressSnapshots[0]?.overallReadiness || 0), 0) / students.length || 0;

          const topWeaknesses = await prisma.skillEvidence.groupBy({
            by: ['skillId'],
            where: {
              student: { collegeId, department: dept.department },
              score: { lt: 0 },
              confidence: { in: ['HIGH', 'MEDIUM'] },
            },
            _count: { skillId: true },
            _avg: { score: true },
            orderBy: { _count: { skillId: 'desc' } },
            take: 5,
          });

          const skills = await prisma.skill.findMany({
            where: { id: { in: topWeaknesses.map(w => w.skillId) } },
          });

          return {
            department: dept.department,
            studentCount: dept._count.department,
            avgReadiness: Math.round(avgReadiness),
            topWeaknesses: topWeaknesses.map(w => ({
              skill: skills.find(s => s.id === w.skillId)?.name || 'Unknown',
              affectedStudents: w._count.skillId,
              avgSeverity: Math.round(Math.abs(w._avg.score || 0) * 100),
            })),
          };
        })
      );

      res.json({ departments: deptAnalytics });
    } catch (error) {
      next(error);
    }
  }
);

/* ---- Placement Readiness Report ---- */
router.get('/college/placement-report',
  authMiddleware,
  requireRole('TPO', 'COLLEGE_ADMIN', 'SUPER_ADMIN'),
  requireCollegeAccess,
  async (req, res, next) => {
    try {
      const collegeId = req.auth!.collegeId!;

      const students = await prisma.student.findMany({
        where: { collegeId, isActive: true },
        include: {
          user: { select: { name: true, email: true } },
          progressSnapshots: { orderBy: { createdAt: 'desc' }, take: 1 },
          assessments: { where: { status: 'COMPLETED' }, take: 10, orderBy: { createdAt: 'desc' } },
        },
      });

      const readyStudents = students.filter(s => (s.progressSnapshots[0]?.overallReadiness || 0) >= 70);
      const needsImprovement = students.filter(s => (s.progressSnapshots[0]?.overallReadiness || 0) < 50);

      // Common gaps across ready students
      const readyStudentIds = readyStudents.map(s => s.id);
      const commonGaps = await prisma.skillEvidence.groupBy({
        by: ['skillId'],
        where: {
          studentId: { in: readyStudentIds },
          score: { lt: 0 },
          confidence: { in: ['HIGH', 'MEDIUM'] },
        },
        _count: { skillId: true },
        orderBy: { _count: { skillId: 'desc' } },
        take: 10,
      });

      const gapSkills = await prisma.skill.findMany({
        where: { id: { in: commonGaps.map(g => g.skillId) } },
      });

      res.json({
        report: {
          totalStudents: students.length,
          placementReady: readyStudents.length,
          needsImprovement: needsImprovement.length,
          readinessRate: students.length > 0 ? Math.round((readyStudents.length / students.length) * 100) : 0,
          commonGaps: commonGaps.map(g => ({
            skill: gapSkills.find(s => s.id === g.skillId)?.name || 'Unknown',
            category: gapSkills.find(s => s.id === g.skillId)?.category || 'Unknown',
            affectedCount: g._count.skillId,
          })),
          studentsNeedingAttention: needsImprovement.slice(0, 20).map(s => ({
            id: s.id,
            studentId: s.studentId,
            name: s.user.name,
            email: s.user.email,
            readiness: s.progressSnapshots[0]?.overallReadiness || 0,
            department: s.department,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/* ---- Export Student Data (CSV) ---- */
router.get('/college/export',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  requireCollegeAccess,
  async (req, res, next) => {
    try {
      const collegeId = req.auth!.collegeId!;

      const students = await prisma.student.findMany({
        where: { collegeId, isActive: true },
        include: {
          user: { select: { name: true, email: true } },
          progressSnapshots: { orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { assessments: true } },
        },
      });

      const csv = [
        'Student ID,Name,Email,Department,Target Role,Readiness,Assessments Completed,Last Assessment Date',
        ...students.map(s => [
          s.studentId,
          `"${s.user.name}"`,
          s.user.email,
          s.department || '',
          s.targetRole || '',
          s.progressSnapshots[0]?.overallReadiness?.toFixed(1) || '0',
          s._count.assessments,
          s.progressSnapshots[0]?.createdAt?.toISOString().split('T')[0] || '',
        ].join(',')),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="college-students-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    } catch (error) {
      next(error);
    }
  }
);

import { z } from 'zod';
export default router;