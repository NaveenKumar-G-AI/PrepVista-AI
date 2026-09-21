import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import type { ProofService } from '../services/proofService.js';
import type { AuthAdapter, AuthContext } from '../domain/ports.js';
import {
  startVerificationSchema, recordResponseSchema, completeVerificationSchema, recalculateSchema,
} from './schemas.js';

type AuthedRequest = FastifyRequest & { auth?: AuthContext };

export function buildServer(proofService: ProofService, authAdapter: AuthAdapter) {
  const app = Fastify({ logger: process.env.PROOF_LOG === 'verbose' });

  app.register(cors, { origin: true });

  // Defense-in-depth (Section 50): authorization is checked here AND
  // enforced again by RLS inside every SECURITY DEFINER function the
  // service layer calls. Neither layer alone is trusted.
  app.addHook('onRequest', async (req: AuthedRequest, reply) => {
    if (req.url === '/proof/health') return;
    const auth = await authAdapter.verify(req.headers.authorization);
    if (!auth) {
      return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    }
    req.auth = auth;
  });

  app.get('/proof/health', async () => ({ ok: true }));

  app.get('/proof/status', async (req: AuthedRequest, reply) => {
    const targetId = (req.query as Record<string, string>)?.['targetId'];
    if (!targetId) return reply.code(400).send({ error: 'targetId query param required' });
    return proofService.getStatus(req.auth!.studentId, targetId);
  });

  app.get('/proof/evidence', async (req: AuthedRequest) => {
    const capability = (req.query as Record<string, string>)?.['capability'];
    return proofService.getEvidence(req.auth!.studentId, capability);
  });

  app.get('/proof/history', async (req: AuthedRequest, reply) => {
    const targetId = (req.query as Record<string, string>)?.['targetId'];
    if (!targetId) return reply.code(400).send({ error: 'targetId query param required' });
    return { history: await proofService.getHistory(req.auth!.studentId, targetId) };
  });

  app.post('/proof/start', async (req: AuthedRequest, reply) => {
    const parsed = startVerificationSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return proofService.startVerification(req.auth!.studentId, parsed.data.targetId);
  });

  app.post('/proof/response', async (req: AuthedRequest, reply) => {
    const parsed = recordResponseSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { sessionId, ...response } = parsed.data;
    try {
      await proofService.recordResponse(req.auth!.studentId, sessionId, response);
      return { ok: true };
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });

  app.post('/proof/complete', async (req: AuthedRequest, reply) => {
    const parsed = completeVerificationSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      return await proofService.completeVerification(req.auth!.studentId, parsed.data.sessionId);
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });

  app.post('/proof/recalculate', async (req: AuthedRequest, reply) => {
    const parsed = recalculateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return proofService.recalculate(req.auth!.studentId, parsed.data.targetId, parsed.data.capability);
  });

  return app;
}
