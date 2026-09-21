import { Router } from 'express';
import { budgetEngine } from '../../budget/BudgetEngine';
import { providerHealthCache } from '../../gateway/defaultGateway';
import { modelRegistry } from '../../registry/ModelRegistry';
import { circuitBreaker } from '../../reliability/CircuitBreaker';
import { DASHBOARD_ROLES, ModelStatus, ProviderHealthStatus, Role } from '../../types';
import { requireRole } from '../middleware/auth';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface Alert {
  id: string;
  type: 'BUDGET_WARNING' | 'BUDGET_EXHAUSTION' | 'PROVIDER_FAILURE' | 'HIGH_FAILURE_RATE' | 'MODEL_DEPRECATION' | 'CIRCUIT_OPEN';
  severity: AlertSeverity;
  message: string;
  detectedAt: string;
}

const router = Router();
router.use(requireRole(DASHBOARD_ROLES));

/**
 * Alerts are computed live from current state rather than read from a
 * persisted table — this in-memory build has no background alerting
 * worker to populate one. A production deployment backed by `ai_alert`
 * (see migrations/001_init.sql) would instead have a scheduled job write
 * rows here so alerts can be deduplicated, acknowledged, and have a
 * history independent of current state; this endpoint's logic is exactly
 * what that job would run on each tick.
 */
router.get('/', (req, res) => {
  const auth = req.auth!;
  const alerts: Alert[] = [];

  const budgets = budgetEngine.listBudgets().filter((b) => auth.role === Role.PLATFORM_ADMIN || auth.role === Role.ENGINEERING_OPERATOR || b.scopeRef === auth.organizationId || b.scope !== 'ORGANIZATION');

  for (const b of budgets) {
    const pct = b.limitUsd === 0 ? 0 : (b.usedUsd / b.limitUsd) * 100;
    if (pct >= 100) {
      alerts.push({ id: `budget-exhausted-${b.id}`, type: 'BUDGET_EXHAUSTION', severity: 'CRITICAL', message: `Budget for ${b.scope}:${b.scopeRef} is exhausted (${pct.toFixed(0)}% used).`, detectedAt: new Date().toISOString() });
    } else if (pct >= b.warningThresholdPct) {
      alerts.push({ id: `budget-warning-${b.id}`, type: 'BUDGET_WARNING', severity: 'WARNING', message: `Budget for ${b.scope}:${b.scopeRef} is at ${pct.toFixed(0)}% of its limit.`, detectedAt: new Date().toISOString() });
    }
  }

  for (const health of providerHealthCache.getAll()) {
    if (health.status === ProviderHealthStatus.UNAVAILABLE || health.status === ProviderHealthStatus.DEGRADED) {
      alerts.push({ id: `provider-${health.provider}`, type: 'PROVIDER_FAILURE', severity: health.status === ProviderHealthStatus.UNAVAILABLE ? 'CRITICAL' : 'WARNING', message: `Provider "${health.provider}" is ${health.status}${health.detail ? `: ${health.detail}` : ''}.`, detectedAt: health.checkedAt });
    }
  }

  for (const circuit of circuitBreaker.listAll()) {
    if (circuit.state === 'OPEN') {
      alerts.push({ id: `circuit-${circuit.key}`, type: 'CIRCUIT_OPEN', severity: 'CRITICAL', message: `Circuit breaker is OPEN for "${circuit.key}" after ${circuit.failuresInWindow} failures.`, detectedAt: new Date(circuit.openedAt ?? Date.now()).toISOString() });
    }
  }

  for (const model of modelRegistry.list()) {
    if (model.status === ModelStatus.DEPRECATED) {
      alerts.push({ id: `deprecated-${model.id}`, type: 'MODEL_DEPRECATION', severity: 'INFO', message: `Model "${model.id}" is deprecated — migrate policies referencing it.`, detectedAt: new Date().toISOString() });
    }
  }

  alerts.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  res.json(alerts);
});

function severityRank(s: AlertSeverity): number {
  return { CRITICAL: 3, WARNING: 2, INFO: 1 }[s];
}

export default router;
