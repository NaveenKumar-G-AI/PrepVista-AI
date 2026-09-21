import { Response } from 'express';
import { z } from 'zod';
import { AuthedRequest } from '../middleware/auth';
import * as alignmentService from '../../services/alignmentService';
import { explainAlignment } from '../../ai/explanationService';
import { getAllTargetProfiles } from '../../db/targetProfileRepository';
import { CAPABILITY_CATALOG } from '../../config/capabilities';
import { CAPABILITY_LEVELS } from '../../domain/types';
import { pool, withRequestContext } from '../../db/pool';

function studentIdOf(req: AuthedRequest): string {
  // For a :studentId route param this has already been authorized by
  // requireSelfOrElevated; for a bare /align route it's always the caller.
  return (req.params.studentId as string | undefined) ?? (req.studentId as string);
}

export async function getDashboard(req: AuthedRequest, res: Response): Promise<void> {
  const studentId = studentIdOf(req);
  const dashboard = await alignmentService.getAlignmentDashboard(studentId);
  res.json(dashboard);
}

export async function listTargets(_req: AuthedRequest, res: Response): Promise<void> {
  const targets = await getAllTargetProfiles(true);
  res.json({ targets });
}

export async function listCapabilities(_req: AuthedRequest, res: Response): Promise<void> {
  res.json({ capabilities: CAPABILITY_CATALOG });
}

export async function getTargetDetail(req: AuthedRequest, res: Response): Promise<void> {
  const studentId = studentIdOf(req);
  const targetId = req.params.targetId as string;
  const result = await alignmentService.getTargetDetail(studentId, targetId);
  if (!result) {
    res.status(404).json({ error: `unknown target ${targetId}` });
    return;
  }

  const includeExplanation = req.query.explain !== 'false';
  const explanation = includeExplanation ? await explainAlignment(result.explanationFacts) : null;

  res.json({ result, explanation });
}

export async function getHistory(req: AuthedRequest, res: Response): Promise<void> {
  const studentId = studentIdOf(req);
  const targetId = req.query.targetId as string | undefined;
  if (!targetId) {
    res.status(400).json({ error: 'targetId query parameter is required' });
    return;
  }
  const history = await alignmentService.getHistory(studentId, targetId);
  res.json({ history });
}

export async function recalculate(req: AuthedRequest, res: Response): Promise<void> {
  const studentId = studentIdOf(req);
  const results = await alignmentService.recalculateAlignment(studentId);
  res.json({ results });
}

const scenarioSchema = z.object({
  targetId: z.string().min(1),
  capabilityId: z.string().min(1),
  projectedLevel: z.enum(CAPABILITY_LEVELS),
});

export async function runScenario(req: AuthedRequest, res: Response): Promise<void> {
  const studentId = studentIdOf(req);
  const parsed = scenarioSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const result = await alignmentService.runWhatIfForStudent(
    studentId,
    parsed.data.targetId,
    parsed.data.capabilityId,
    parsed.data.projectedLevel,
  );
  if (!result) {
    res.status(404).json({ error: `unknown target ${parsed.data.targetId}` });
    return;
  }
  res.json({ result });
}

const selectTargetSchema = z.object({
  targetId: z.string().min(1),
  previousTargetId: z.string().nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
});

export async function selectTarget(req: AuthedRequest, res: Response): Promise<void> {
  const studentId = studentIdOf(req);
  const parsed = selectTargetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  await alignmentService.selectTarget(
    studentId,
    parsed.data.targetId,
    parsed.data.previousTargetId ?? null,
    parsed.data.reason ?? null,
  );
  res.status(201).json({ ok: true });
}

export async function improveGap(req: AuthedRequest, res: Response): Promise<void> {
  const studentId = studentIdOf(req);
  const targetId = req.params.targetId as string;
  const capabilityId = req.body?.capabilityId as string | undefined;
  if (!capabilityId) {
    res.status(400).json({ error: 'capabilityId is required' });
    return;
  }
  const ok = await alignmentService.improveGap(studentId, targetId, capabilityId);
  if (!ok) {
    res.status(404).json({ error: 'target or gap not found' });
    return;
  }
  res.status(202).json({ ok: true, message: 'Sent to ADAPT (Feature 26) via the outbox.' });
}

export async function proveTarget(req: AuthedRequest, res: Response): Promise<void> {
  const studentId = studentIdOf(req);
  const targetId = req.params.targetId as string;
  const ok = await alignmentService.proveTarget(studentId, targetId);
  if (!ok) {
    res.status(404).json({ error: `unknown target ${targetId}` });
    return;
  }
  res.status(202).json({ ok: true, message: 'Sent to PROOF (Feature 28) via the outbox.' });
}

const proofWebhookSchema = z.object({
  studentId: z.string().min(1),
  capabilityId: z.string().min(1),
  verified: z.boolean(),
  sourceRef: z.string().optional(),
});

/**
 * spec §41/§58: the real Feature 28 should call this once it has verified
 * (or rejected) a capability, so ALIGN can recalculate. This reference
 * implementation also marks the reference evidence table verified so the
 * loop is demonstrable standalone — see docs/INTEGRATION.md for how a real
 * deployment wires this instead.
 */
export async function proofCompletedWebhook(req: AuthedRequest, res: Response): Promise<void> {
  const secret = process.env.PROOF_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers['x-proof-signature'];
    if (provided !== secret) {
      res.status(401).json({ error: 'invalid webhook signature' });
      return;
    }
  } else {
    console.warn('[proofCompletedWebhook] PROOF_WEBHOOK_SECRET is not set — accepting unsigned request. Configure this before production use.');
  }

  const parsed = proofWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (parsed.data.verified) {
    await withRequestContext({ studentId: parsed.data.studentId, role: 'service' }, (client) =>
      client.query(
        `UPDATE capability_evidence_events
         SET proof_verified = true
         WHERE student_id = $1 AND capability_id = $2
           AND id = (
             SELECT id FROM capability_evidence_events
             WHERE student_id = $1 AND capability_id = $2
             ORDER BY occurred_at DESC LIMIT 1
           )`,
        [parsed.data.studentId, parsed.data.capabilityId],
      ),
    );
  }

  const results = await alignmentService.recalculateAlignment(parsed.data.studentId);
  res.status(200).json({ ok: true, recalculated: results.length });
}
