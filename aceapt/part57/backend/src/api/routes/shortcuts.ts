import { Router } from 'express';
import { requireParam } from '../util';
import { z } from 'zod';
import type { AuthedRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validateRequest';
import { StrategyType } from '../../domain/enums';
import * as libraryService from '../../services/libraryService';

export const shortcutsRouter = Router();

shortcutsRouter.get('/mine', (req: AuthedRequest, res) => {
  const { tenantId, studentId } = req.auth!;
  res.json(libraryService.getMyShortcuts(tenantId, studentId));
});

shortcutsRouter.get('/profile', (req: AuthedRequest, res) => {
  const { tenantId, studentId } = req.auth!;
  res.json(libraryService.getShortcutProfile(tenantId, studentId));
});

shortcutsRouter.get('/search', (req: AuthedRequest, res) => {
  const { tenantId, studentId } = req.auth!;
  const q = String(req.query.q ?? '');
  res.json(libraryService.searchShortcuts(tenantId, studentId, q));
});

const conditionRuleSchema = z.object({
  field: z.string(),
  op: z.enum(['eq', 'neq', 'in', 'not_in', 'range', 'exists', 'gt', 'gte', 'lt', 'lte']),
  value: z.unknown().optional(),
  label: z.string().optional(),
});

const validationDomainSchema = z.object({
  variables: z.record(z.object({ min: z.number(), max: z.number(), integer: z.boolean().optional() })),
});

const createShortcutSchema = z.object({
  canonicalName: z.string().min(1).max(120),
  description: z.string().max(2000).default(''),
  category: z.string().max(80).default(''),
  domain: z.string().max(80).default(''),
  strategyType: z.enum(StrategyType),
  problemType: z.string().max(200).default(''),
  steps: z.array(z.string().max(500)).max(20).default([]),
  whenToUse: z.string().max(500).default(''),
  whenNotTo: z.string().max(500).default(''),
  expression: z.string().max(300).optional(),
  canonicalExpression: z.string().max(300).optional(),
  validationDomain: validationDomainSchema.optional(),
  requiresOptions: z.boolean().default(false),
  isApproximation: z.boolean().default(false),
  acceptableError: z.number().optional(),
});

shortcutsRouter.post('/', validateBody(createShortcutSchema), (req: AuthedRequest, res) => {
  const { tenantId, studentId } = req.auth!;
  const dto = libraryService.createPersonalShortcut({ tenantId, studentId, ...req.body });
  res.status(201).json(dto);
});

shortcutsRouter.get('/:id', (req: AuthedRequest, res) => {
  const { tenantId, studentId } = req.auth!;
  res.json(libraryService.getShortcutDetail(tenantId, studentId, requireParam(req, 'id')));
});

shortcutsRouter.post('/:id/test', (req: AuthedRequest, res) => {
  const { tenantId, studentId } = req.auth!;
  res.json(libraryService.testShortcut(tenantId, studentId, requireParam(req, 'id')));
});

shortcutsRouter.get('/:id/performance', (req: AuthedRequest, res) => {
  const { tenantId, studentId } = req.auth!;
  const detail = libraryService.getShortcutDetail(tenantId, studentId, requireParam(req, 'id'));
  res.json(detail.performance);
});

shortcutsRouter.post('/:id/archive', (req: AuthedRequest, res) => {
  const { studentId } = req.auth!;
  libraryService.archiveShortcut(studentId, requireParam(req, 'id'));
  res.status(204).end();
});

const preferenceSchema = z.object({
  preferred: z.boolean().optional(),
  pinned: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
});

shortcutsRouter.patch('/:id/preference', validateBody(preferenceSchema), (req: AuthedRequest, res) => {
  const { tenantId, studentId } = req.auth!;
  libraryService.setPreference(tenantId, studentId, requireParam(req, 'id'), req.body);
  res.status(204).end();
});
