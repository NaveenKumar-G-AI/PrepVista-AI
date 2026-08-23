import { Router, type Request } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { assessmentAttempt } from "../db/schema";
import * as readiness from "../services/readinessService";
import * as skillGapSvc from "../services/skillGapService";
import * as training from "../services/trainingService";
import * as assessmentSvc from "../services/assessmentService";
import * as interventionSvc from "../services/interventionService";
import * as actionPlan from "../services/actionPlanService";
import { requireRole } from "./middleware/auth";
import { asyncHandler, param } from "./middleware/common";
import { ForbiddenError, NotFoundError } from "../lib/errors";

export const studentRouter = Router();
studentRouter.use(requireRole("STUDENT"));

/** Every route below uses the caller's OWN linked student id — never a
 *  studentId from the URL/body — so one student can't query another's data
 *  by guessing an id (spec §66 privacy). */
function myStudentId(req: Request): string {
  if (!req.actor?.linkedStudentId) throw new ForbiddenError("This account is not linked to a student record");
  return req.actor.linkedStudentId;
}

studentRouter.get(
  "/readiness",
  asyncHandler(async (req, res) => {
    const studentId = myStudentId(req);
    const [latest, change, trend] = await Promise.all([
      readiness.getLatestSnapshot(studentId),
      readiness.getReadinessChange(studentId),
      readiness.getReadinessTrend(studentId),
    ]);
    res.json({ latest, change, trend });
  })
);

studentRouter.get(
  "/skill-gaps",
  asyncHandler(async (req, res) => {
    res.json(await skillGapSvc.getSkillGaps(myStudentId(req)));
  })
);

studentRouter.get(
  "/training",
  asyncHandler(async (req, res) => {
    res.json(await training.getStudentTraining(myStudentId(req)));
  })
);

studentRouter.get(
  "/assessments",
  asyncHandler(async (req, res) => {
    res.json(await assessmentSvc.getStudentAssessments(myStudentId(req)));
  })
);

studentRouter.get(
  "/interventions",
  asyncHandler(async (req, res) => {
    res.json(await interventionSvc.getStudentInterventions(myStudentId(req)));
  })
);

studentRouter.get(
  "/action-plan",
  asyncHandler(async (req, res) => {
    res.json(await actionPlan.getActionPlan(myStudentId(req), req.actor!.institutionId));
  })
);

studentRouter.post(
  "/assessments/:versionId/start",
  asyncHandler(async (req, res) => {
    const row = await assessmentSvc.startAttempt({
      assessmentVersionId: param(req, "versionId"),
      studentId: myStudentId(req),
      institutionId: req.actor!.institutionId,
      source: "WEB",
    });
    res.json(row);
  })
);

studentRouter.post(
  "/assessments/attempts/:attemptId/submit",
  asyncHandler(async (req, res) => {
    const studentId = myStudentId(req);
    const [attempt] = await db.select().from(assessmentAttempt).where(eq(assessmentAttempt.id, param(req, "attemptId")));
    if (!attempt) throw new NotFoundError("AssessmentAttempt", param(req, "attemptId"));
    if (attempt.studentId !== studentId) throw new ForbiddenError("This attempt does not belong to you");

    const { answers } = z.object({ answers: z.record(z.string(), z.unknown()) }).parse(req.body);
    const result = await assessmentSvc.submitAttempt({ attemptId: param(req, "attemptId"), institutionId: req.actor!.institutionId, answers });
    res.json(result);
  })
);
