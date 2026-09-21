import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { Response } from "express";
import { ROLE_RUBRICS, CAPABILITIES, getCapability } from "../config/rubrics.js";
import { getRepository } from "../data/repository.js";
import { buildExplanationProvider } from "../services/explanation.service.js";
import { getReadinessState } from "../services/readinessOrchestrator.service.js";
import { logEvent } from "../services/event.service.js";
import { parseRecommendationId } from "../services/recommendation.service.js";
import {
  completeRecommendationSchema,
  setTargetRoleSchema,
  skipRecommendationSchema,
  submitAssessmentAttemptSchema,
} from "../validators/schemas.js";
import { authStub, NotFoundError, type AuthedRequest } from "../middleware/common.js";
import type { RoleOption } from "../types/domain.js";

export function buildReadinessRadarRouter(env: NodeJS.ProcessEnv = process.env): Router {
  const router = Router();
  const repository = getRepository();
  const explanationProvider = buildExplanationProvider(env);

  // Reference data — no student context required.
  router.get("/roles", (_req, res: Response) => {
    const roles: RoleOption[] = ROLE_RUBRICS.map((rubric) => ({
      roleId: rubric.roleId,
      roleName: rubric.roleName,
      capabilities: rubric.entries.map((e) => ({
        capabilityId: e.capabilityId,
        capabilityName: getCapability(e.capabilityId)?.name ?? e.capabilityId,
        weight: e.weight,
        targetBar: e.targetBar,
      })),
    }));
    res.json({ roles });
  });

  router.use(authStub);

  router.get("/state", async (req: AuthedRequest, res: Response, next) => {
    try {
      const state = await getReadinessState(repository, explanationProvider, req.studentId!, { logEvents: true });
      res.json(state);
    } catch (err) {
      next(err);
    }
  });

  router.get("/events", async (req: AuthedRequest, res: Response, next) => {
    try {
      const events = await repository.getEvents(req.studentId!, 50);
      res.json({ events });
    } catch (err) {
      next(err);
    }
  });

  router.post("/target-role", async (req: AuthedRequest, res: Response, next) => {
    try {
      const { roleId } = setTargetRoleSchema.parse(req.body);
      const existing = await repository.getStudent(req.studentId!);
      await repository.upsertStudent({
        studentId: req.studentId!,
        displayName: existing?.displayName ?? req.studentId!,
        targetRoleId: roleId,
        updatedAt: new Date().toISOString(),
      });
      await logEvent(repository, req.studentId!, "TARGET_ROLE_SET", { roleId });
      const state = await getReadinessState(repository, explanationProvider, req.studentId!);
      res.json(state);
    } catch (err) {
      next(err);
    }
  });

  router.post("/assessment-attempts", async (req: AuthedRequest, res: Response, next) => {
    try {
      const { capabilityId, score, source } = submitAssessmentAttemptSchema.parse(req.body);
      const attempt = {
        id: randomUUID(),
        studentId: req.studentId!,
        capabilityId,
        score,
        source,
        takenAt: new Date().toISOString(),
      };
      await repository.addAttempt(attempt);
      await logEvent(repository, req.studentId!, "ASSESSMENT_COMPLETED", {
        capabilityId,
        score,
        source,
        attemptId: attempt.id,
      });
      const state = await getReadinessState(repository, explanationProvider, req.studentId!);
      res.status(201).json(state);
    } catch (err) {
      next(err);
    }
  });

  router.post("/recommendations/:id/complete", async (req: AuthedRequest, res: Response, next) => {
    try {
      const { resultScore } = completeRecommendationSchema.parse(req.body ?? {});
      const parsed = parseRecommendationId(req.params.id ?? "");
      if (!parsed || !CAPABILITIES.some((c) => c.id === parsed.capabilityId)) {
        throw new NotFoundError("That recommendation doesn't exist (it may have already changed).");
      }

      await logEvent(repository, req.studentId!, "ACTION_COMPLETED", {
        recommendationId: req.params.id,
        capabilityId: parsed.capabilityId,
        actionType: parsed.actionType,
        resultScore: resultScore ?? null,
      });

      if (resultScore !== undefined) {
        const attempt = {
          id: randomUUID(),
          studentId: req.studentId!,
          capabilityId: parsed.capabilityId,
          score: resultScore,
          source: "post_action_practice",
          takenAt: new Date().toISOString(),
        };
        await repository.addAttempt(attempt);
        await logEvent(repository, req.studentId!, "ASSESSMENT_COMPLETED", {
          capabilityId: parsed.capabilityId,
          score: resultScore,
          source: "post_action_practice",
          attemptId: attempt.id,
        });
      }

      const state = await getReadinessState(repository, explanationProvider, req.studentId!);
      res.json(state);
    } catch (err) {
      next(err);
    }
  });

  router.post("/recommendations/:id/skip", async (req: AuthedRequest, res: Response, next) => {
    try {
      const { reason } = skipRecommendationSchema.parse(req.body ?? {});
      const parsed = parseRecommendationId(req.params.id ?? "");
      if (!parsed || !CAPABILITIES.some((c) => c.id === parsed.capabilityId)) {
        throw new NotFoundError("That recommendation doesn't exist (it may have already changed).");
      }

      await logEvent(repository, req.studentId!, "ACTION_SKIPPED", {
        recommendationId: req.params.id,
        capabilityId: parsed.capabilityId,
        actionType: parsed.actionType,
        reason: reason ?? null,
      });

      const state = await getReadinessState(repository, explanationProvider, req.studentId!);
      res.json(state);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
