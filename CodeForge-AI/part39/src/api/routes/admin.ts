import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config';
import { emergencyControls } from '../../gateway/EmergencyControls';
import { auditLog } from '../../telemetry/AuditLog';
import { DASHBOARD_ROLES, EMERGENCY_ROLES, Role, TaskType } from '../../types';
import { requireRole } from '../middleware/auth';

const router = Router();
router.use(requireRole(DASHBOARD_ROLES));

router.get('/emergency-state', (_req, res) => {
  res.json(emergencyControls.snapshot());
});

router.get('/audit-log', (req, res, next) => {
  try {
    const auth = req.auth!;
    const limit = req.query.limit ? Number(req.query.limit) : 200;
    if (req.query.organizationId === 'all') {
      if (auth.role !== Role.PLATFORM_ADMIN && auth.role !== Role.ENGINEERING_OPERATOR) {
        res.status(403).json({ error: 'Cross-organization access is not permitted for this role' });
        return;
      }
      res.json(auditLog.listAll(limit));
      return;
    }
    res.json(auditLog.listForOrganization(auth.organizationId, limit));
  } catch (err) {
    next(err);
  }
});

router.use(requireRole(EMERGENCY_ROLES));

/**
 * Kill switch requires THREE independent things to align: an
 * EMERGENCY_ROLES role (checked by the middleware above), an explicit
 * `confirm: true` in the body, and a static passphrase that only exists
 * if an operator deliberately set EMERGENCY_CONTROL_PASSPHRASE. Leaving
 * that env var blank (the shipped default) disables this endpoint
 * entirely rather than falling back to "role check only" — see spec:
 * "strong authorization, explicit confirmation."
 */
const killSwitchSchema = z.object({ activate: z.boolean(), reason: z.string().min(3).max(500).optional(), confirm: z.literal(true), passphrase: z.string() });

router.post('/emergency/kill-switch', (req, res, next) => {
  try {
    const auth = req.auth!;
    if (!config.emergency.passphrase) {
      res.status(503).json({ error: 'Emergency kill switch is disabled: EMERGENCY_CONTROL_PASSPHRASE is not configured' });
      return;
    }
    const body = killSwitchSchema.parse(req.body);
    if (body.passphrase !== config.emergency.passphrase) {
      res.status(403).json({ error: 'Incorrect passphrase' });
      return;
    }

    if (body.activate) emergencyControls.activateKillSwitch(body.reason ?? 'No reason given');
    else emergencyControls.deactivateKillSwitch();

    auditLog.record('EMERGENCY_CONTROL', { control: 'kill-switch', activate: body.activate, reason: body.reason }, { organizationId: auth.organizationId, actorId: auth.userId, actorRole: auth.role });
    res.json(emergencyControls.snapshot());
  } catch (err) {
    next(err);
  }
});

const providerSchema = z.object({ provider: z.string().min(1), disabled: z.boolean() });
router.post('/emergency/provider', (req, res, next) => {
  try {
    const auth = req.auth!;
    const body = providerSchema.parse(req.body);
    if (body.disabled) emergencyControls.disableProvider(body.provider);
    else emergencyControls.enableProvider(body.provider);
    auditLog.record('EMERGENCY_CONTROL', { control: 'provider', ...body }, { organizationId: auth.organizationId, actorId: auth.userId, actorRole: auth.role, target: body.provider });
    res.json(emergencyControls.snapshot());
  } catch (err) {
    next(err);
  }
});

const taskSchema = z.object({ task: z.nativeEnum(TaskType), disabled: z.boolean() });
router.post('/emergency/task', (req, res, next) => {
  try {
    const auth = req.auth!;
    const body = taskSchema.parse(req.body);
    if (body.disabled) emergencyControls.disableTask(body.task);
    else emergencyControls.enableTask(body.task);
    auditLog.record('EMERGENCY_CONTROL', { control: 'task', ...body }, { organizationId: auth.organizationId, actorId: auth.userId, actorRole: auth.role, target: body.task });
    res.json(emergencyControls.snapshot());
  } catch (err) {
    next(err);
  }
});

const concurrencySchema = z.object({ key: z.string().min(1), limit: z.number().int().positive().nullable() });
router.post('/emergency/concurrency', (req, res, next) => {
  try {
    const auth = req.auth!;
    const body = concurrencySchema.parse(req.body);
    if (body.limit === null) emergencyControls.clearConcurrencyOverride(body.key);
    else emergencyControls.setConcurrencyOverride(body.key, body.limit);
    auditLog.record('EMERGENCY_CONTROL', { control: 'concurrency', ...body }, { organizationId: auth.organizationId, actorId: auth.userId, actorRole: auth.role, target: body.key });
    res.json(emergencyControls.snapshot());
  } catch (err) {
    next(err);
  }
});

const bulkPauseSchema = z.object({ paused: z.boolean() });
router.post('/emergency/bulk-pause', (req, res, next) => {
  try {
    const auth = req.auth!;
    const body = bulkPauseSchema.parse(req.body);
    emergencyControls.setBulkPaused(body.paused);
    auditLog.record('EMERGENCY_CONTROL', { control: 'bulk-pause', ...body }, { organizationId: auth.organizationId, actorId: auth.userId, actorRole: auth.role });
    res.json(emergencyControls.snapshot());
  } catch (err) {
    next(err);
  }
});

export default router;
