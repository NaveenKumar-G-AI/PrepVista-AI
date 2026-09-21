import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { LearningActionService } from "../../services/learningActionService.js";
import type { Store } from "../../repositories/types.js";
import { NotFoundError, InvalidTransitionError } from "../../services/events.js";

export default async function actionsRoutes(fastify: FastifyInstance, opts: { store: Store }) {
  const service = new LearningActionService(opts.store);
  const idParams = z.object({ actionId: z.string().min(1) });
  const completeBody = z.object({ resultingEvidenceSummary: z.string().optional() }).optional();

  function handleError(err: unknown, reply: any) {
    if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
    if (err instanceof InvalidTransitionError) return reply.code(409).send({ error: err.message });
    throw err;
  }

  fastify.get("/api/actions/:actionId", async (request, reply) => {
    const { actionId } = idParams.parse(request.params);
    try {
      return reply.send(await service.get(request.studentId, actionId));
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.post("/api/actions/:actionId/start", async (request, reply) => {
    const { actionId } = idParams.parse(request.params);
    try {
      return reply.send(await service.start(request.studentId, actionId));
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.post("/api/actions/:actionId/complete", async (request, reply) => {
    const { actionId } = idParams.parse(request.params);
    const body = completeBody.parse(request.body ?? {});
    try {
      return reply.send(await service.complete(request.studentId, actionId, body?.resultingEvidenceSummary));
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.post("/api/actions/:actionId/postpone", async (request, reply) => {
    const { actionId } = idParams.parse(request.params);
    try {
      return reply.send(await service.postpone(request.studentId, actionId));
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.post("/api/actions/:actionId/skip", async (request, reply) => {
    const { actionId } = idParams.parse(request.params);
    try {
      return reply.send(await service.skip(request.studentId, actionId));
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.post("/api/actions/:actionId/request-verification", async (request, reply) => {
    const { actionId } = idParams.parse(request.params);
    try {
      return reply.send(await service.requestVerification(request.studentId, actionId));
    } catch (err) {
      return handleError(err, reply);
    }
  });
}
