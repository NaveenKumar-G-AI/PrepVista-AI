import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireStudentContext } from "../middleware/auth.js";
import type { DiagnosticSessionService } from "../../engine/sessionManager.js";
import type { DiagnosticRepository } from "../../types/contracts.js";
import { compareBaselineToCurrent } from "../../engine/reassessment.js";

const rawResponseSchema = z.object({
  clientResponseId: z.string().min(1),
  questionId: z.string().min(1),
  skillNodeId: z.string().min(1),
  answer: z.unknown(),
  isCorrect: z.boolean().nullable(),
  questionDifficulty: z.enum(["easy", "medium", "hard", "very_hard"]),
  expectedDurationMs: z.number().int().positive(),
  startedAt: z.string(),
  completedAt: z.string(),
  durationMs: z.number().int().nonnegative(),
  confidence: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
  hintUsed: z.boolean(),
  attemptNumber: z.number().int().positive(),
  wasPreviouslyExposed: z.boolean(),
});

const modeSchema = z.enum([
  "first_diagnostic",
  "placement_diagnostic",
  "topic_diagnostic",
  "subtopic_diagnostic",
  "company_diagnostic",
  "reassessment",
  "verification_diagnostic",
]);

/**
 * Module 38: "Inspect existing API architecture first ... use the project's
 * existing route conventions." No existing ACEAPT API was reachable this
 * session (see TRUTH_TABLE.md) — these routes use plain REST/Fastify
 * conventions as a reasonable default, and are organized so re-mounting
 * them under whatever router/framework ACEAPT actually uses is a thin
 * adapter, not a rewrite: every handler body only calls `service` methods.
 *
 * Every route: (1) authenticates via requireStudentContext, (2) validates
 * input shape via zod, (3) lets the SECURITY DEFINER layer enforce
 * ownership — ctx.studentId always comes from auth, never from the request
 * body, so a client cannot pass someone else's studentId even if it tried.
 */
export function registerDiagnosticRoutes(app: FastifyInstance, service: DiagnosticSessionService, repo: DiagnosticRepository) {
  app.post("/diagnostics/start", async (request, reply) => {
    const ctx = await requireStudentContext(request, reply);
    if (!ctx) return;

    const bodySchema = z.object({ blueprintId: z.string().min(1), mode: modeSchema });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.issues });

    const result = await service.startOrResume(ctx, parsed.data.blueprintId, parsed.data.mode);
    return reply.send(result);
  });

  app.get("/diagnostics/:sessionId/next", async (request, reply) => {
    const ctx = await requireStudentContext(request, reply);
    if (!ctx) return;

    const params = z.object({ sessionId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    try {
      const result = await service.getNextStep(ctx, params.data.sessionId);
      return reply.send(result);
    } catch (err) {
      return reply.code(404).send({ error: "DIAG_SESSION_NOT_FOUND" });
    }
  });

  app.post("/diagnostics/:sessionId/responses", async (request, reply) => {
    const ctx = await requireStudentContext(request, reply);
    if (!ctx) return;

    const params = z.object({ sessionId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const body = rawResponseSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT", details: body.error.issues });

    const result = await service.submitResponse(ctx, params.data.sessionId, { ...body.data, answer: body.data.answer ?? null });
    if (!result.ok) return reply.code(409).send(result);
    return reply.send(result);
  });

  app.post("/diagnostics/:sessionId/pause", async (request, reply) => {
    const ctx = await requireStudentContext(request, reply);
    if (!ctx) return;
    const params = z.object({ sessionId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const result = await service.pause(ctx, params.data.sessionId);
    return reply.code(result.ok ? 200 : 409).send(result);
  });

  app.post("/diagnostics/:sessionId/resume", async (request, reply) => {
    const ctx = await requireStudentContext(request, reply);
    if (!ctx) return;
    const params = z.object({ sessionId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const result = await service.resume(ctx, params.data.sessionId);
    return reply.code(result.ok ? 200 : 409).send(result);
  });

  app.post("/diagnostics/:sessionId/complete", async (request, reply) => {
    const ctx = await requireStudentContext(request, reply);
    if (!ctx) return;
    const params = z.object({ sessionId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const result = await service.complete(ctx, params.data.sessionId);
    return reply.code(result.ok ? 200 : 409).send(result);
  });

  app.get("/diagnostics/:sessionId/result", async (request, reply) => {
    const ctx = await requireStudentContext(request, reply);
    if (!ctx) return;
    const params = z.object({ sessionId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const snapshot = await repo.getLatestSnapshot(ctx, params.data.sessionId);
    if (!snapshot) return reply.code(404).send({ error: "NO_RESULT_YET" });
    return reply.send(snapshot);
  });

  app.get("/diagnostics/:sessionId/profile", async (request, reply) => {
    const ctx = await requireStudentContext(request, reply);
    if (!ctx) return;
    const params = z.object({ sessionId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const estimates = await repo.getSkillEstimates(ctx, params.data.sessionId);
    return reply.send({ skillEstimates: estimates });
  });

  app.get("/diagnostics/:sessionId/baseline-vs-current", async (request, reply) => {
    const ctx = await requireStudentContext(request, reply);
    if (!ctx) return;
    const params = z.object({ sessionId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const { current, baseline } = await repo.getBaselineVsCurrent(ctx, params.data.sessionId);
    if (!current) return reply.code(404).send({ error: "NO_RESULT_YET" });
    return reply.send(compareBaselineToCurrent(baseline, current));
  });

  app.post("/diagnostics/:blueprintId/reassess", async (request, reply) => {
    const ctx = await requireStudentContext(request, reply);
    if (!ctx) return;
    const params = z.object({ blueprintId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const result = await service.startReassessment(ctx, params.data.blueprintId);
    return reply.code(result.ok ? 200 : 409).send(result);
  });

  app.get("/diagnostics/:sessionId/explain/:skillNodeId", async (request, reply) => {
    const ctx = await requireStudentContext(request, reply);
    if (!ctx) return;
    const params = z.object({ sessionId: z.string().min(1), skillNodeId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const explanation = await service.explainSkill(ctx, params.data.sessionId, params.data.skillNodeId);
    if (explanation === null) return reply.code(404).send({ error: "SKILL_NOT_FOUND_IN_SESSION" });
    return reply.send({ explanation });
  });
}
