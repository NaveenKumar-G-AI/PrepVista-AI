import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { INTERVIEW_MODES } from "../domain/types.js";
import type { InterviewOrchestrator } from "../orchestration/interviewOrchestrator.js";
import { authGuard, getTenantContext } from "./middleware.js";

const createInterviewSchema = z.object({
  candidateId: z.string().uuid(),
  targetRole: z.string().min(1),
  mode: z.enum(INTERVIEW_MODES),
  restrictToSkills: z.array(z.string()).optional(),
});
// Note what is deliberately NOT in this schema: score, mastery, confidence,
// readiness, gapStatus, evaluation — §62 says the frontend must never be
// able to submit any of these, and a Zod schema that never mentions them
// makes "never" a parse-time fact rather than a convention someone has to
// remember to enforce downstream.

const submitResponseSchema = z.object({
  questionId: z.string().uuid(),
  responseText: z.string().min(1).max(20000),
});

export function registerTechnicalInterviewRoutes(app: FastifyInstance, orchestrator: InterviewOrchestrator): void {
  app.addHook("preHandler", authGuard);

  app.post("/interviews", async (request, reply) => {
    const body = createInterviewSchema.parse(request.body);
    const ctx = getTenantContext(request);
    const session = await orchestrator.createInterview(ctx, body);
    reply.code(201).send(session);
  });

  app.post<{ Params: { id: string } }>("/interviews/:id/start", async (request, reply) => {
    const ctx = getTenantContext(request);
    const result = await orchestrator.startSession(ctx, request.params.id);
    reply.send(result);
  });

  app.get<{ Params: { id: string } }>("/interviews/:id/current-question", async (request, reply) => {
    const ctx = getTenantContext(request);
    const question = await orchestrator.getCurrentQuestion(ctx, request.params.id);
    reply.send({ question });
  });

  app.post<{ Params: { id: string } }>("/interviews/:id/responses", async (request, reply) => {
    const ctx = getTenantContext(request);
    const idempotencyKey = firstHeader(request.headers["idempotency-key"]);
    if (!idempotencyKey) {
      reply.code(400).send({ error: "Idempotency-Key header is required" });
      return;
    }
    const body = submitResponseSchema.parse(request.body);
    const result = await orchestrator.submitResponse(ctx, {
      sessionId: request.params.id,
      questionId: body.questionId,
      responseText: body.responseText,
      idempotencyKey,
    });
    reply.send(result);
  });

  app.post<{ Params: { id: string } }>("/interviews/:id/pause", async (request, reply) => {
    const ctx = getTenantContext(request);
    const session = await orchestrator.pause(ctx, request.params.id);
    reply.send(session);
  });

  app.post<{ Params: { id: string } }>("/interviews/:id/resume", async (request, reply) => {
    const ctx = getTenantContext(request);
    const result = await orchestrator.resume(ctx, request.params.id);
    reply.send(result);
  });

  app.get<{ Params: { candidateId: string } }>("/candidates/:candidateId/interviews", async (request, reply) => {
    const ctx = getTenantContext(request);
    const sessions = await orchestrator.getHistory(ctx, request.params.candidateId);
    reply.send({ sessions });
  });

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof z.ZodError) {
      reply.code(400).send({ error: "validation_error", issues: err.issues });
      return;
    }
    app.log.error(err);
    reply.code(500).send({ error: "internal_error" });
  });
}

function firstHeader(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
