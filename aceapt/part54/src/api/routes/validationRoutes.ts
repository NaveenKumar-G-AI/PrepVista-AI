import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { QuestionValidationService } from "../../service/QuestionValidationService.js";
import { scopeRunForRole } from "../../security/accessControl.js";
import type { Role, ValidationMode, ValidationPorts, QuestionVersionSnapshot } from "../../contracts/types.js";

/**
 * spec §159. Every route re-derives {role, tenantId} from the AUTHENTICATED
 * request context and applies scopeRunForRole before a response leaves the
 * process — defense-in-depth on top of whatever the caller's own client-side
 * UI would have hidden anyway (spec §109, §149).
 *
 * PORT (see /TRUTH_TABLE.md): real authentication was not reachable this
 * session — requestContextFromHeaders below trusts request headers directly,
 * which is NOT safe for production. Replace it with real auth middleware;
 * nothing else in this file needs to change since it only depends on the
 * resulting {role, id, tenantId} shape.
 */
function requestContextFromHeaders(headers: Record<string, string | string[] | undefined>): { role: Role; id: string; tenantId: string | null } {
  const role = (headers["x-qve-role"] as Role) ?? "STUDENT";
  const id = (headers["x-qve-user-id"] as string) ?? "anonymous";
  const tenantId = (headers["x-qve-tenant-id"] as string) ?? null;
  return { role, id, tenantId };
}

const validateBodySchema = z.object({
  questionVersion: z.custom<QuestionVersionSnapshot>(),
  mode: z.enum(["FAST", "STANDARD", "DEEP", "ASSESSMENT", "RUNTIME", "REVALIDATION"])
});

export function registerValidationRoutes(app: FastifyInstance, service: QuestionValidationService, ports: ValidationPorts): FastifyPluginAsync {
  const plugin: FastifyPluginAsync = async (instance) => {
    instance.post("/questions/:questionId/versions/:versionId/validate", async (request, reply) => {
      const caller = requestContextFromHeaders(request.headers as Record<string, string>);
      const parsed = validateBodySchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: "INVALID_BODY", issues: parsed.error.issues });

      const run = await service.validateQuestionVersion({
        questionVersion: parsed.data.questionVersion,
        mode: parsed.data.mode as ValidationMode,
        requestedBy: { role: caller.role, id: caller.id },
        ports
      });
      return reply.send(scopeRunForRole(run, caller.role));
    });

    instance.post("/questions/:questionId/versions/:versionId/revalidate", async (request, reply) => {
      const caller = requestContextFromHeaders(request.headers as Record<string, string>);
      if (caller.role !== "ADMIN" && caller.role !== "REVIEWER" && caller.role !== "CONTENT_EDITOR" && caller.role !== "SYSTEM") {
        return reply.status(403).send({ error: "FORBIDDEN" });
      }
      const parsed = validateBodySchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: "INVALID_BODY", issues: parsed.error.issues });

      const run = await service.revalidateQuestion({
        questionVersion: parsed.data.questionVersion,
        mode: parsed.data.mode as ValidationMode,
        requestedBy: { role: caller.role, id: caller.id },
        ports,
        reason: (request.body as { reason?: string }).reason
      });
      return reply.send(scopeRunForRole(run, caller.role));
    });

    instance.get("/validation-runs/:runId", async (request, reply) => {
      const caller = requestContextFromHeaders(request.headers as Record<string, string>);
      const { runId } = request.params as { runId: string };
      const run = await service.getValidationResults(caller, caller.tenantId, runId);
      if (!run) return reply.status(404).send({ error: "NOT_FOUND" });
      return reply.send(scopeRunForRole(run, caller.role));
    });

    instance.get("/questions/:questionId/validation-history", async (request, reply) => {
      const caller = requestContextFromHeaders(request.headers as Record<string, string>);
      const { questionId } = request.params as { questionId: string };
      const history = await service.getValidationHistory(caller, caller.tenantId, questionId);
      return reply.send(history.map((run) => scopeRunForRole(run, caller.role)));
    });

    instance.get("/questions/:questionId/versions/:versionId/eligibility", async (request, reply) => {
      const caller = requestContextFromHeaders(request.headers as Record<string, string>);
      const { versionId } = request.params as { versionId: string };
      const { mode } = request.query as { mode: "practice" | "timed" | "assessment" };
      const snapshot = (request.body as { currentSnapshot?: QuestionVersionSnapshot })?.currentSnapshot;
      if (!snapshot) return reply.status(400).send({ error: "MISSING_CURRENT_SNAPSHOT" });
      const result = await service.checkEligibility(caller, mode ?? "practice", versionId, snapshot);
      return reply.send(result);
    });
  };
  return plugin;
}
