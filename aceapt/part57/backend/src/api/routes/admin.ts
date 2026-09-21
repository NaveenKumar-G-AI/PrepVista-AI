import { Router } from 'express';
import { requireParam } from '../util';
import { z } from 'zod';
import type { AuthedRequest } from '../middleware/auth';
import { requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validateRequest';
import { ShortcutSource, StrategyClassification, StrategyType } from '../../domain/enums';
import * as shortcutRepo from '../../repositories/shortcutRepository';
import * as validationRepo from '../../repositories/validationRepository';
import * as usageRepo from '../../repositories/usageRepository';
import { validateShortcut } from '../../services/validationService';
import { scanForRegressions } from '../../services/regressionService';
import { DomainError } from '../../domain/types';

export const adminRouter = Router();

// Every route below requires CONTENT_REVIEWER or ADMIN (sec. 232, "Content
// reviewer can manage global strategies. Admin can manage system-wide content").
adminRouter.use(requireRole('CONTENT_REVIEWER', 'ADMIN'));

adminRouter.get('/shortcuts', (req: AuthedRequest, res) => {
  const { tenantId } = req.auth!;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json(shortcutRepo.listAllForAdmin(tenantId, status));
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

const createGlobalSchema = z.object({
  canonicalName: z.string().min(1).max(120),
  description: z.string().max(2000).default(''),
  category: z.string().max(80).default(''),
  domain: z.string().max(80).default(''),
  skillId: z.string().optional(),
  formulaId: z.string().optional(),
  questionFamilyId: z.string().optional(),
  strategyType: z.enum(StrategyType),
  classification: z.enum(StrategyClassification).default('CONDITIONAL'),
  source: z.enum(ShortcutSource).default('CONTENT_TEAM'),
  requiresOptions: z.boolean().default(false),
  isApproximation: z.boolean().default(false),
  acceptableError: z.number().optional(),
  version: z.object({
    description: z.string().default(''),
    steps: z.array(z.string()).default([]),
    conditions: z.array(conditionRuleSchema).default([]),
    nonApplicability: z.array(conditionRuleSchema).default([]),
    underlyingReason: z.string().default(''),
    expression: z.string().optional(),
    canonicalExpression: z.string().optional(),
    validationDomain: validationDomainSchema.optional(),
  }),
});

/** Sec. 129, 170 - content-team/trainer-authored GLOBAL shortcuts (owner_student_id stays NULL). */
adminRouter.post('/shortcuts', validateBody(createGlobalSchema), (req: AuthedRequest, res) => {
  const { tenantId } = req.auth!;
  const body = req.body as z.infer<typeof createGlobalSchema>;
  const shortcut = shortcutRepo.insertShortcut({
    tenantId,
    ownerStudentId: null,
    canonicalName: body.canonicalName,
    description: body.description,
    category: body.category,
    domain: body.domain,
    skillId: body.skillId,
    formulaId: body.formulaId,
    questionFamilyId: body.questionFamilyId,
    strategyType: body.strategyType,
    classification: body.classification,
    source: body.source,
    status: 'UNVERIFIED',
    requiresOptions: body.requiresOptions,
    isApproximation: body.isApproximation,
    acceptableError: body.acceptableError ?? null,
  });
  shortcutRepo.insertVersion({
    shortcutId: shortcut.shortcut_id,
    version: 1,
    description: body.version.description,
    steps: body.version.steps,
    conditions: body.version.conditions,
    nonApplicability: body.version.nonApplicability,
    underlyingReason: body.version.underlyingReason,
    expression: body.version.expression,
    canonicalExpression: body.version.canonicalExpression,
    validationDomain: body.version.validationDomain,
  });
  res.status(201).json(shortcutRepo.getShortcutById(shortcut.shortcut_id));
});

const exampleSchema = z.object({
  isCounterexample: z.boolean().default(false),
  input: z.record(z.number()),
  expectedOutput: z.number().optional(),
  questionId: z.string().optional(),
  note: z.string().default(''),
});

adminRouter.post('/shortcuts/:id/examples', validateBody(exampleSchema), (req: AuthedRequest, res) => {
  const shortcut = shortcutRepo.getShortcutById(requireParam(req, 'id'));
  if (!shortcut) throw new DomainError('Unknown shortcut.', 404, 'NOT_FOUND');
  const version = shortcutRepo.getLatestVersion(shortcut.shortcut_id);
  if (!version) throw new DomainError('Shortcut has no version.', 400, 'NO_VERSION');
  shortcutRepo.insertExample({ shortcutId: shortcut.shortcut_id, version: version.version, ...req.body });
  res.status(201).json(shortcutRepo.listExamples(shortcut.shortcut_id, version.version));
});

adminRouter.post('/shortcuts/:id/validate', (req: AuthedRequest, res) => {
  const shortcut = shortcutRepo.getShortcutById(requireParam(req, 'id'));
  if (!shortcut) throw new DomainError('Unknown shortcut.', 404, 'NOT_FOUND');
  const version = shortcutRepo.getLatestVersion(shortcut.shortcut_id);
  if (!version) throw new DomainError('Shortcut has no version.', 400, 'NO_VERSION');
  res.json(validateShortcut(shortcut.shortcut_id, version.version));
});

adminRouter.get('/shortcuts/:id/validation-dashboard', (req: AuthedRequest, res) => {
  const shortcut = shortcutRepo.getShortcutById(requireParam(req, 'id'));
  if (!shortcut) throw new DomainError('Unknown shortcut.', 404, 'NOT_FOUND');
  res.json({ shortcut, validations: validationRepo.listValidations(shortcut.shortcut_id) });
});

adminRouter.post('/regression-scan', (req: AuthedRequest, res) => {
  const { tenantId } = req.auth!;
  res.json(scanForRegressions(tenantId));
});

const excludeSchema = z.object({ reason: z.string().min(1).max(200) });

/** Sec. 136, 259 - lets an admin retroactively exclude usage evidence tied to a since-invalidated question. */
adminRouter.post('/usages/:id/exclude', validateBody(excludeSchema), (req: AuthedRequest, res) => {
  usageRepo.excludeUsage(requireParam(req, 'id'), req.body.reason);
  res.status(204).end();
});
