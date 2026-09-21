import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { LearningPathService } from "../../services/learningPathService.js";
import type { Store } from "../../repositories/types.js";
import { NotFoundError } from "../../services/events.js";

export default async function pathRoutes(fastify: FastifyInstance, opts: { store: Store }) {
  const service = new LearningPathService(opts.store);

  fastify.get("/api/path", async (request, reply) => {
    const path = await service.getCurrentPath(request.studentId);
    return reply.send(path);
  });

  fastify.post("/api/path/regenerate", async (request, reply) => {
    try {
      const path = await service.regeneratePath(request.studentId);
      return reply.send(path);
    } catch (err) {
      if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
      throw err;
    }
  });

  fastify.get("/api/path/history", async (request, reply) => {
    const versions = await service.getPathHistory(request.studentId);
    return reply.send(versions);
  });

  fastify.get("/api/path/next-best-action", async (request, reply) => {
    const node = await service.getNextBestAction(request.studentId);
    if (!node) return reply.code(404).send({ error: "No active path node — evidence may be complete or not yet available." });
    return reply.send(node);
  });

  const skillIdParams = z.object({ skillId: z.string().min(1) });

  fastify.get("/api/path/nodes/:skillId", async (request, reply) => {
    const { skillId } = skillIdParams.parse(request.params);
    const detail = await service.getNodeDetail(request.studentId, skillId);
    if (!detail) return reply.code(404).send({ error: `No path node for skill ${skillId}.` });
    return reply.send(detail);
  });

  fastify.get("/api/path/nodes/:skillId/why", async (request, reply) => {
    const { skillId } = skillIdParams.parse(request.params);
    const why = await service.explainNode(request.studentId, skillId);
    if (!why) return reply.code(404).send({ error: `No path node for skill ${skillId}.` });
    return reply.send(why);
  });

  fastify.get("/api/plan/today", async (request, reply) => {
    const result = await service.getTodaysMission(request.studentId);
    if (!result) return reply.code(404).send({ error: "Nothing to plan — no active path node." });
    return reply.send(result);
  });
}
