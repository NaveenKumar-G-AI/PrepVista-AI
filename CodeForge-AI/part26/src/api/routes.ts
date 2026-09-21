import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { SkillSignalRepository } from '../db/repository.js';
import { ingestEvidence } from '../engine/pipeline.js';
import { buildTechnicalProfile } from '../engine/profile.js';
import { SKILL_CATALOG, SKILL_PREREQUISITES } from '../policy/policy.js';
import type { RawEvidenceInput } from '../domain/models.js';

/**
 * Defense in depth (req #47/#99): the API connects to Postgres as app_service,
 * which BYPASSES RLS by design (it's the trusted backend). That means THIS check
 * is the only thing stopping a student's token from reading another student's
 * :studentId in the URL — RLS won't save us here, because from the database's
 * point of view app_service is allowed to see everyone. Every student-scoped
 * route calls this before touching the repository.
 */
function authorizeStudentAccess(request: FastifyRequest, reply: FastifyReply, studentId: string): boolean {
  if (request.auth.role === 'service') return true;
  if (request.auth.role === 'student' && request.auth.studentId === studentId) return true;
  reply.code(403).send({ error: 'forbidden', message: 'not authorized to view this student' });
  return false;
}

const rawEvidenceSchema = z.array(
  z.object({
    sourceType: z.string(),
    sourceId: z.string(),
    studentId: z.string().uuid(),
    skillIds: z.array(z.string()).min(1),
    payload: z.record(z.string(), z.unknown()),
    difficulty: z.number().min(0).max(1).optional(),
    contextGroup: z.string().optional(),
    assessmentTier: z.string().optional(),
    occurredAt: z.string(),
    evidenceVersion: z.number().int().optional(),
  })
);

export function registerRoutes(app: FastifyInstance, repo: SkillSignalRepository) {
  // Ingestion — this is what upstream systems (execution engine, complexity
  // analyzer, debugging system, ...) call. Service-role only: students never
  // write evidence directly (req #71).
  app.post('/evidence', async (request, reply) => {
    if (request.auth.role !== 'service') return reply.code(403).send({ error: 'forbidden' });
    const parsed = rawEvidenceSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_payload', issues: parsed.error.issues });
    const summary = await ingestEvidence(repo, parsed.data as RawEvidenceInput[], new Date().toISOString());
    return summary;
  });

  app.get<{ Params: { studentId: string } }>('/students/:studentId/profile', async (request, reply) => {
    const { studentId } = request.params;
    if (!authorizeStudentAccess(request, reply, studentId)) return;
    const signals = await repo.getAllSignalsForStudent(studentId);
    return buildTechnicalProfile(studentId, signals, new Date().toISOString());
  });

  app.get<{ Params: { studentId: string } }>('/students/:studentId/signals', async (request, reply) => {
    const { studentId } = request.params;
    if (!authorizeStudentAccess(request, reply, studentId)) return;
    return repo.getAllSignalsForStudent(studentId);
  });

  app.get<{ Params: { studentId: string; skillId: string } }>('/students/:studentId/signals/:skillId', async (request, reply) => {
    const { studentId, skillId } = request.params;
    if (!authorizeStudentAccess(request, reply, studentId)) return;
    const signal = await repo.getSignal(studentId, skillId);
    if (!signal) return reply.code(404).send({ error: 'not_found' });
    return signal;
  });

  app.get<{ Params: { studentId: string; skillId: string } }>('/students/:studentId/signals/:skillId/evidence', async (request, reply) => {
    const { studentId, skillId } = request.params;
    if (!authorizeStudentAccess(request, reply, studentId)) return;
    return repo.getEvidenceForSkill(studentId, skillId);
  });

  app.get<{ Params: { studentId: string; skillId: string } }>('/students/:studentId/signals/:skillId/explanation', async (request, reply) => {
    const { studentId, skillId } = request.params;
    if (!authorizeStudentAccess(request, reply, studentId)) return;
    const explanation = await repo.getExplanation(studentId, skillId);
    if (!explanation) return reply.code(404).send({ error: 'not_found' });
    return explanation;
  });

  app.get<{ Params: { studentId: string; skillId: string } }>('/students/:studentId/signals/:skillId/trend', async (request, reply) => {
    const { studentId, skillId } = request.params;
    if (!authorizeStudentAccess(request, reply, studentId)) return;
    return repo.getHistory(studentId, skillId);
  });

  app.get<{ Params: { studentId: string } }>('/students/:studentId/strengths', async (request, reply) => {
    const { studentId } = request.params;
    if (!authorizeStudentAccess(request, reply, studentId)) return;
    const profile = buildTechnicalProfile(studentId, await repo.getAllSignalsForStudent(studentId), new Date().toISOString());
    return { strengths: profile.strengths };
  });

  app.get<{ Params: { studentId: string } }>('/students/:studentId/weaknesses', async (request, reply) => {
    const { studentId } = request.params;
    if (!authorizeStudentAccess(request, reply, studentId)) return;
    const profile = buildTechnicalProfile(studentId, await repo.getAllSignalsForStudent(studentId), new Date().toISOString());
    return { weaknesses: profile.weaknesses };
  });

  app.get<{ Params: { studentId: string } }>('/students/:studentId/uncertainties', async (request, reply) => {
    const { studentId } = request.params;
    if (!authorizeStudentAccess(request, reply, studentId)) return;
    const profile = buildTechnicalProfile(studentId, await repo.getAllSignalsForStudent(studentId), new Date().toISOString());
    return { uncertainties: profile.uncertainties };
  });

  // Public reference data (req #24/#25) — not per-student, no ownership check needed.
  app.get('/skills/graph', async () => {
    return { skills: SKILL_CATALOG, prerequisites: SKILL_PREREQUISITES };
  });

  app.get('/health', async () => ({ ok: true }));
}
