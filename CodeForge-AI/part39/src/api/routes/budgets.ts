import { Router } from 'express';
import { z } from 'zod';
import { BudgetScope, budgetEngine } from '../../budget/BudgetEngine';
import { auditLog } from '../../telemetry/AuditLog';
import { CONFIG_WRITE_ROLES, DASHBOARD_ROLES, Role } from '../../types';
import { requireRole } from '../middleware/auth';
import { assertOrgAccess } from '../middleware/tenant';

const router = Router();
router.use(requireRole(DASHBOARD_ROLES));

router.get('/', (req, res) => {
  const auth = req.auth!;
  const all = budgetEngine.listBudgets();
  if (auth.role === Role.PLATFORM_ADMIN || auth.role === Role.ENGINEERING_OPERATOR) {
    res.json(all);
    return;
  }
  // Non-platform roles only ever see their own org's budgets, plus
  // GLOBAL/FEATURE-scoped budgets (which aren't org-identifying).
  res.json(all.filter((b) => b.scope !== BudgetScope.ORGANIZATION || b.scopeRef === auth.organizationId));
});

const upsertSchema = z.object({
  scope: z.nativeEnum(BudgetScope),
  scopeRef: z.string().min(1),
  period: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
  limitUsd: z.number().positive(),
  warningThresholdPct: z.number().min(1).max(100).default(80),
  hardLimit: z.boolean().default(true),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});

router.post('/', requireRole(CONFIG_WRITE_ROLES), (req, res, next) => {
  try {
    const auth = req.auth!;
    const body = upsertSchema.parse(req.body);

    let scopeRef = body.scopeRef;
    if (body.scope === BudgetScope.ORGANIZATION) scopeRef = assertOrgAccess(auth, scopeRef);
    if (body.scope === BudgetScope.GLOBAL && auth.role !== Role.PLATFORM_ADMIN) {
      res.status(403).json({ error: 'Only PLATFORM_ADMIN may set a GLOBAL budget' });
      return;
    }

    const record = budgetEngine.upsertBudget({ ...body, scopeRef });
    auditLog.record('CONFIGURATION_CHANGE', { entity: 'budget', ...body, scopeRef }, { organizationId: auth.organizationId, actorId: auth.userId, actorRole: auth.role, target: record.id });
    res.json(record);
  } catch (err) {
    next(err);
  }
});

export default router;
