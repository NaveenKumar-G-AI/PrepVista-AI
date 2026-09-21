import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Store } from "../../repositories/types.js";

const dimensionSchema = z.object({
  accuracy: z.number().min(0).max(1).nullable(),
  attempts: z.number().int().min(0),
  avgResponseTimeMs: z.number().nullable(),
  lastAssessedAt: z.string().nullable(),
});

const evidenceBody = z.object({
  skillId: z.string().min(1),
  foundation: dimensionSchema,
  application: dimensionSchema,
  transferFamiliar: dimensionSchema,
  transferVariant: dimensionSchema,
  recentDifficulty: z.enum(["FOUNDATION", "BEGINNER", "INTERMEDIATE", "ADVANCED", "CHALLENGE"]),
  recentErrorSignatures: z.array(z.string()),
  verifiedAt: z.string().nullable(),
});

/**
 * NOT part of Feature 4's real contract — in production this data is
 * written directly by Feature 3 (the Skill Signal Intelligence Engine),
 * not received over HTTP from a client. This route exists purely so the
 * seed/demo scripts and integration tests can simulate "Feature 3 just
 * produced new evidence" without a real Feature 3 in this session. Only
 * registered when DEMO_MODE is true — see src/server.ts.
 */
export default async function devEvidenceRoutes(fastify: FastifyInstance, opts: { store: Store }) {
  fastify.post("/api/dev/evidence", async (request, reply) => {
    const body = evidenceBody.parse(request.body);
    await opts.store.upsertEvidence({ studentId: request.studentId, ...body });
    return reply.code(204).send();
  });
}
