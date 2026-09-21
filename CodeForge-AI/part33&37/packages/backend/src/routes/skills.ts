import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware, requireRole } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import { paginationSchema } from '@prepvista/shared';
import { logger } from '../lib/logger';

const router = Router();

/* ---- Get All Skills (Hierarchical) ---- */
router.get('/',
  authMiddleware,
  validateQuery(paginationSchema.extend({
    category: z.string().optional(),
    parentOnly: z.coerce.boolean().optional(),
  })),
  async (req, res, next) => {
    try {
      const { category, parentOnly, page, limit } = req.query;

      const where: any = { isActive: true };
      if (category) where.category = category;
      if (parentOnly) where.parentId = null;

      const skills = await prisma.skill.findMany({
        where,
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        skip: ((page as number) - 1) * (limit as number),
        take: limit as number,
        include: { children: true },
      });

      const total = await prisma.skill.count({ where });

      // If parentOnly, return just parents with child counts
      if (parentOnly) {
        const parentSkills = skills.filter(s => !s.parentId);
        res.json({
          skills: parentSkills.map(s => ({
            ...s,
            childCount: skills.filter(c => c.parentId === s.id).length,
          })),
          pagination: { page: page as number, limit: limit as number, total: parentSkills.length, totalPages: Math.ceil(parentSkills.length / (limit as number)) },
        });
        return;
      }

      // Build hierarchy
      const skillMap = new Map(skills.map(s => [s.id, { ...s, children: [] as any[] }]));
      const roots: any[] = [];

      skills.forEach(s => {
        const node = skillMap.get(s.id)!;
        if (s.parentId) {
          const parent = skillMap.get(s.parentId);
          if (parent) parent.children.push(node);
        } else {
          roots.push(node);
        }
      });

      res.json({
        skills: roots,
        pagination: { page: page as number, limit: limit as number, total, totalPages: Math.ceil(total / (limit as number)) },
      });
    } catch (error) {
      next(error);
    }
  }
);

/* ---- Get Skill Categories ---- */
router.get('/categories',
  authMiddleware,
  async (req, res, next) => {
    try {
      const categories = await prisma.skill.groupBy({
        by: ['category'],
        where: { isActive: true },
        _count: { category: true },
      });

      res.json({
        categories: categories.map(c => ({ name: c.category, skillCount: c._count.category })),
      });
    } catch (error) {
      next(error);
    }
  }
);

/* ---- Get Skill by ID ---- */
router.get('/:id',
  authMiddleware,
  async (req, res, next) => {
    try {
      const skill = await prisma.skill.findUnique({
        where: { id: req.params.id },
        include: {
          parent: true,
          children: true,
          _count: { select: { evidence: true } },
        },
      });

      if (!skill) {
        return res.status(404).json({ error: 'Skill not found', code: 'NOT_FOUND' });
      }

      res.json({ skill });
    } catch (error) {
      next(error);
    }
  }
);

import { z } from 'zod';
export default router;