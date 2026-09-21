import { Router } from 'express';
import { z } from 'zod';
import { PolicyScope, policyEngine } from '../../policy/PolicyEngine';
import { auditLog } from '../../telemetry/AuditLog';
import { CONFIG_WRITE_ROLES, DASHBOARD_ROLES, ModelCapability, Role } from '../../types';
import { requireRole } from '../middleware/auth';
import { assertOrgAccess } from '../middleware/tenant';

const router = Router();
router.use(requireRole(DASHBOARD_ROLES));

router.get('/', (_req, res) => {
  res.json(policyEngine.listAll());
});

const policyConfigSchema = z.object({
  preferredModel: z.string().optional(),
  allowedModels: z.array(z.string()).optional(),
  allowedProviders: z.array(z.string()).optional(),
  fallbackModels: z.array(z.string()).optional(),
  maxCostUsd: z.number().positive().optional(),
  maxLatencyMs: z.number().positive().optional(),
  timeoutMs: z.number().positive().optional(),
  maxRetries: z.number().int().min(0).max(8).optional(),
  maxConcurrency: z.number().positive().optional(),
  rateLimitPerMinute: z.number().positive().optional(),
  cachingEnabled: z.boolean().optional(),
  maxContextTokens: z.number().positive().optional(),
  qualityRequirement: z.enum(['STANDARD', 'HIGH']).optional(),
});

const putSchema = z.object({
  scope: z.nativeEnum(PolicyScope),
  scopeRef: z.string().nullable().optional(),
  config: policyConfigSchema,
  requiredCapabilitiesHint: z.array(z.nativeEnum(ModelCapability)).optional(),
});

/**
 * PUT rather than POST/PATCH: setting a policy for a given (scope,
 * scopeRef) is idempotent and fully replaces that scope's configuration —
 * this mirrors PolicyEngine.setPolicy's own semantics and avoids the
 * ambiguity of a partial PATCH silently leaving old fields in place.
 */
router.put('/', requireRole(CONFIG_WRITE_ROLES), (req, res, next) => {
  try {
    const auth = req.auth!;
    const body = putSchema.parse(req.body);

    if (body.scope === PolicyScope.GLOBAL && auth.role !== Role.PLATFORM_ADMIN) {
      res.status(403).json({ error: 'Only PLATFORM_ADMIN may set GLOBAL policy' });
      return;
    }

    let scopeRef = body.scopeRef ?? null;
    if (body.scope === PolicyScope.ORGANIZATION) {
      scopeRef = assertOrgAccess(auth, scopeRef ?? undefined);
    } else if (body.scope !== PolicyScope.GLOBAL && !scopeRef) {
      res.status(400).json({ error: `scopeRef is required for scope ${body.scope}` });
      return;
    }

    const stored = policyEngine.setPolicy(body.scope, scopeRef, body.config, auth.userId, body.requiredCapabilitiesHint);

    auditLog.record('CONFIGURATION_CHANGE', { entity: 'policy', scope: body.scope, scopeRef, config: body.config }, { organizationId: auth.organizationId, actorId: auth.userId, actorRole: auth.role, target: `${body.scope}:${scopeRef}` });

    res.json(stored);
  } catch (err) {
    next(err);
  }
});

router.delete('/', requireRole(CONFIG_WRITE_ROLES), (req, res, next) => {
  try {
    const auth = req.auth!;
    const scope = req.query.scope as PolicyScope;
    let scopeRef = (req.query.scopeRef as string | undefined) ?? null;
    if (!Object.values(PolicyScope).includes(scope)) {
      res.status(400).json({ error: 'Invalid scope' });
      return;
    }
    if (scope === PolicyScope.ORGANIZATION) scopeRef = assertOrgAccess(auth, scopeRef ?? undefined);

    policyEngine.deactivate(scope, scopeRef);
    auditLog.record('CONFIGURATION_CHANGE', { entity: 'policy', action: 'deactivate', scope, scopeRef }, { organizationId: auth.organizationId, actorId: auth.userId, actorRole: auth.role, target: `${scope}:${scopeRef}` });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
