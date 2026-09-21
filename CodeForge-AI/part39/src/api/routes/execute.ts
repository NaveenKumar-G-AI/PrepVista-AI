import { randomUUID } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { aiGateway } from '../../gateway/defaultGateway';
import { ModelCapability, Priority, TaskType } from '../../types';

const router = Router();

const executeSchema = z.object({
  feature: z.string().min(1).max(200),
  task: z.nativeEnum(TaskType),
  priority: z.nativeEnum(Priority).default(Priority.NORMAL),
  requiredCapabilities: z.array(z.nativeEnum(ModelCapability)).default([]),
  qualityRequirement: z.enum(['STANDARD', 'HIGH']).optional(),
  maxCostUsd: z.number().positive().optional(),
  maxLatencyMs: z.number().positive().optional(),
  maxOutputTokens: z.number().int().positive().max(64_000).optional(),
  messages: z
    .array(z.object({ role: z.enum(['system', 'user', 'assistant']), content: z.string().min(1).max(500_000) }))
    .min(1)
    .max(200),
  idempotencyKey: z.string().max(200).optional(),
});

const STATUS_HTTP_MAP: Record<string, number> = {
  SUCCESS: 200,
  CACHED: 200,
  FALLBACK: 200,
  FAILED: 502,
  BLOCKED: 200, // structured business-logic block (budget/quota/policy) — not a server error
  DEGRADED: 200,
};

/**
 * The single execution entry point every CodeForge AI feature should
 * call. Note this route deliberately does very little itself — it
 * validates the wire format and hands off to AIGateway, which owns every
 * actual decision (policy, budget, routing, retries, ...). That's the
 * whole point of the gateway pattern: this file should never need to
 * change when a new control is added to the gateway.
 */
router.post('/', async (req, res, next) => {
  try {
    const auth = req.auth!;
    const body = executeSchema.parse(req.body);

    const result = await aiGateway.execute({
      requestId: randomUUID(),
      organizationId: auth.organizationId,
      userId: auth.userId,
      feature: body.feature,
      task: body.task,
      priority: body.priority,
      requiredCapabilities: body.requiredCapabilities,
      qualityRequirement: body.qualityRequirement,
      maxCostUsd: body.maxCostUsd,
      maxLatencyMs: body.maxLatencyMs,
      maxOutputTokens: body.maxOutputTokens,
      messages: body.messages,
      idempotencyKey: body.idempotencyKey,
    });

    res.status(STATUS_HTTP_MAP[result.status] ?? 200).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
