import express, { type Express } from "express";
import { z } from "zod";
import type { GapAnalysisService } from "../application/gapAnalysisService.js";
import type { GapRepositoryPort } from "../ports/index.js";
import { authContext, errorHandler, requireStudentAccess } from "./middleware.js";

const paramsSchema = z.object({
  studentId: z.string().min(1).max(128),
  roleId: z.string().min(1).max(128),
});
const skillParamsSchema = paramsSchema.extend({
  skillId: z.string().min(1).max(128),
});
const priorityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/**
 * Builds the Express app for Phase 55's required capabilities:
 *   - current role skill gaps
 *   - critical gaps / priority gaps
 *   - single skill gap detail
 *   - gap evidence (traceability)
 *   - gap history
 *   - gap progress (coverage rollup)
 *
 * Every route is read-only (GET) - there is no endpoint that accepts a
 * gap score, severity, priority, or closure state from the client
 * (Phase 51: the frontend cannot submit authoritative values because there
 * is nowhere for it to do so).
 *
 * Organization scoping always comes from `req.auth.organizationId`
 * (server-verified), never from the URL or body (Phase 49, 56).
 */
export function createApp(deps: { gapAnalysis: GapAnalysisService; repository: GapRepositoryPort }): Express {
  const app = express();
  app.use(express.json());

  const router = express.Router();
  router.use(authContext);

  router.get("/students/:studentId/roles/:roleId/gap-profile", requireStudentAccess, async (req, res, next) => {
    try {
      const { studentId, roleId } = paramsSchema.parse(req.params);
      const profile = await deps.gapAnalysis.analyzeRole({
        organizationId: req.auth!.organizationId,
        studentId,
        roleId,
      });
      res.json(profile);
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/students/:studentId/roles/:roleId/gap-profile/critical",
    requireStudentAccess,
    async (req, res, next) => {
      try {
        const { studentId, roleId } = paramsSchema.parse(req.params);
        const profile = await deps.gapAnalysis.analyzeRole({
          organizationId: req.auth!.organizationId,
          studentId,
          roleId,
        });
        res.json({ criticalGaps: profile.criticalGaps });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/students/:studentId/roles/:roleId/gap-profile/priority",
    requireStudentAccess,
    async (req, res, next) => {
      try {
        const { studentId, roleId } = paramsSchema.parse(req.params);
        const { limit } = priorityQuerySchema.parse(req.query);
        const profile = await deps.gapAnalysis.analyzeRole({
          organizationId: req.auth!.organizationId,
          studentId,
          roleId,
        });
        res.json({ priorityGaps: profile.priorityGaps.slice(0, limit ?? 10) });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get("/students/:studentId/roles/:roleId/progress", requireStudentAccess, async (req, res, next) => {
    try {
      const { studentId, roleId } = paramsSchema.parse(req.params);
      const profile = await deps.gapAnalysis.analyzeRole({
        organizationId: req.auth!.organizationId,
        studentId,
        roleId,
      });
      res.json({
        coreSkillCoverage: profile.coreSkillCoverage,
        totalSkills: profile.skills.length,
        unassessedCount: profile.unassessedSkills.length,
        criticalCount: profile.criticalGaps.length,
        rootGapCount: profile.rootGaps.length,
        calculatedAt: profile.calculatedAt,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/students/:studentId/roles/:roleId/skills/:skillId",
    requireStudentAccess,
    async (req, res, next) => {
      try {
        const { studentId, roleId, skillId } = skillParamsSchema.parse(req.params);
        const profile = await deps.gapAnalysis.analyzeRole({
          organizationId: req.auth!.organizationId,
          studentId,
          roleId,
        });
        const skill = profile.skills.find((s) => s.skillId === skillId);
        if (!skill) {
          res.status(404).json({ error: "Skill not found in this role's requirements." });
          return;
        }
        res.json(skill);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/students/:studentId/roles/:roleId/skills/:skillId/evidence",
    requireStudentAccess,
    async (req, res, next) => {
      try {
        const { studentId, roleId, skillId } = skillParamsSchema.parse(req.params);
        const profile = await deps.gapAnalysis.analyzeRole({
          organizationId: req.auth!.organizationId,
          studentId,
          roleId,
        });
        const skill = profile.skills.find((s) => s.skillId === skillId);
        if (!skill) {
          res.status(404).json({ error: "Skill not found in this role's requirements." });
          return;
        }
        res.json(skill.evidenceSummary);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/students/:studentId/roles/:roleId/skills/:skillId/history",
    requireStudentAccess,
    async (req, res, next) => {
      try {
        const { studentId, roleId, skillId } = skillParamsSchema.parse(req.params);
        const history = await deps.repository.getHistory(req.auth!.organizationId, studentId, roleId, skillId);
        res.json({ history });
      } catch (err) {
        next(err);
      }
    },
  );

  app.use(router);
  app.use(errorHandler);
  return app;
}
