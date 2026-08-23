import { Router } from "express";
import { z } from "zod";
import * as training from "../services/trainingService";
import * as assessmentSvc from "../services/assessmentService";
import * as interventionSvc from "../services/interventionService";
import * as effectiveness from "../services/effectivenessService";
import * as readiness from "../services/readinessService";
import * as overview from "../services/overviewService";
import * as aiTools from "../ai-tools";
import { requireCapability } from "./middleware/auth";
import { asyncHandler, param } from "./middleware/common";

export const tpoRouter = Router();

const selectorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("STUDENT_IDS"), studentIds: z.array(z.string()) }),
  z.object({ kind: z.literal("DEPARTMENT"), department: z.string() }),
  z.object({ kind: z.literal("COHORT"), cohortId: z.string() }),
  z.object({ kind: z.literal("READINESS_SEGMENT"), category: z.string(), belowScore: z.number() }),
]);

// ---- Training ---------------------------------------------------------

tpoRouter.post(
  "/training/programs",
  requireCapability("MANAGE_TRAINING"),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        seasonId: z.string(),
        name: z.string(),
        description: z.string().optional(),
        categoryId: z.string(),
        targetSkillIds: z.array(z.string()).optional(),
        trainerUserId: z.string().optional(),
        capacity: z.number().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      })
      .parse(req.body);
    const row = await training.createProgram({ ...body, institutionId: req.actor!.institutionId, createdBy: req.actor!.id });
    res.status(201).json(row);
  })
);

tpoRouter.post(
  "/training/programs/:id/transition",
  requireCapability("MANAGE_TRAINING"),
  asyncHandler(async (req, res) => {
    const { toStatus } = z.object({ toStatus: z.string() }).parse(req.body);
    const row = await training.transitionProgramStatus(param(req, "id"), toStatus, req.actor!.id, req.actor!.institutionId);
    res.json(row);
  })
);

tpoRouter.get(
  "/training/programs/:id",
  requireCapability("VIEW_TPO_WORKBENCH"),
  asyncHandler(async (req, res) => {
    res.json(await training.getProgramDetail(param(req, "id")));
  })
);

tpoRouter.post(
  "/training/programs/:id/sessions",
  requireCapability("MANAGE_TRAINING"),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string(),
        scheduledAt: z.coerce.date(),
        durationMinutes: z.number(),
        location: z.string().optional(),
        mode: z.enum(["IN_PERSON", "ONLINE", "HYBRID"]),
        trainerUserId: z.string().optional(),
        capacity: z.number().optional(),
      })
      .parse(req.body);
    const row = await training.createSession({ ...body, trainingProgramId: param(req, "id"), institutionId: req.actor!.institutionId });
    res.status(201).json(row);
  })
);

tpoRouter.post(
  "/training/cohorts",
  requireCapability("MANAGE_TRAINING"),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        seasonId: z.string(),
        name: z.string(),
        ruleType: z.enum(["STATIC", "DEPARTMENT", "READINESS_SEGMENT", "SKILL_GAP", "CUSTOM"]),
        rule: z.record(z.string(), z.unknown()).optional(),
        staticStudentIds: z.array(z.string()).optional(),
      })
      .parse(req.body);
    const row = await training.createCohort({ ...body, institutionId: req.actor!.institutionId, createdBy: req.actor!.id });
    res.status(201).json(row);
  })
);

/** Preview before committing — spec §49: "Selected: 84 students / CSE: 39 / IT: 21 / ECE: 24". */
tpoRouter.post(
  "/preview-selection",
  requireCapability("VIEW_TPO_WORKBENCH"),
  asyncHandler(async (req, res) => {
    const { seasonId, selector } = z.object({ seasonId: z.string(), selector: selectorSchema }).parse(req.body);
    res.json(await training.previewSelection(req.actor!.institutionId, seasonId, selector));
  })
);

tpoRouter.post(
  "/training/programs/:id/enroll",
  requireCapability("MANAGE_TRAINING"),
  asyncHandler(async (req, res) => {
    const { seasonId, selector, assignmentReason, sourceCohortId } = z
      .object({ seasonId: z.string(), selector: selectorSchema, assignmentReason: z.string().optional(), sourceCohortId: z.string().optional() })
      .parse(req.body);
    const studentIds = await training.resolveSelector(req.actor!.institutionId, seasonId, selector);
    const result = await training.bulkEnroll({
      trainingProgramId: param(req, "id"),
      institutionId: req.actor!.institutionId,
      studentIds,
      assignedBy: req.actor!.id,
      assignmentReason,
      sourceCohortId,
    });
    res.json(result);
  })
);

tpoRouter.post(
  "/training/attendance",
  requireCapability("RECORD_ATTENDANCE"),
  asyncHandler(async (req, res) => {
    const body = z.object({ sessionId: z.string(), studentId: z.string(), status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]) }).parse(req.body);
    const row = await training.recordAttendance({ ...body, recordedBy: req.actor!.id, institutionId: req.actor!.institutionId });
    res.json(row);
  })
);

// ---- Assessments --------------------------------------------------------

tpoRouter.post(
  "/assessments",
  requireCapability("MANAGE_ASSESSMENTS"),
  asyncHandler(async (req, res) => {
    const body = z.object({ name: z.string(), categoryId: z.string(), skillIds: z.array(z.string()).default([]) }).parse(req.body);
    const row = await assessmentSvc.createAssessment({ ...body, institutionId: req.actor!.institutionId, createdBy: req.actor!.id });
    res.status(201).json(row);
  })
);

const questionSchema = z.object({
  type: z.enum(["MCQ", "MULTI_SELECT", "CODING", "TEXT", "RATING", "PRACTICAL", "CUSTOM"]),
  prompt: z.string(),
  options: z.unknown().optional(),
  correctAnswer: z.unknown().optional(),
  skillId: z.string().optional(),
  maxScore: z.number(),
  order: z.number(),
});

tpoRouter.post(
  "/assessments/:id/versions",
  requireCapability("MANAGE_ASSESSMENTS"),
  asyncHandler(async (req, res) => {
    const body = z
      .object({ durationMins: z.number(), maxScore: z.number(), passingScore: z.number().optional(), questions: z.array(questionSchema).default([]) })
      .parse(req.body);
    const row = await assessmentSvc.createVersion({ ...body, assessmentId: param(req, "id") });
    res.status(201).json(row);
  })
);

tpoRouter.post(
  "/assessments/versions/:versionId/publish",
  requireCapability("MANAGE_ASSESSMENTS"),
  asyncHandler(async (req, res) => {
    const row = await assessmentSvc.publishVersion(param(req, "versionId"), req.actor!.id, req.actor!.institutionId);
    res.json(row);
  })
);

tpoRouter.post(
  "/assessments/attempts/:attemptId/finalize",
  requireCapability("MANAGE_ASSESSMENTS"),
  asyncHandler(async (req, res) => {
    const body = z.object({ manualScores: z.record(z.string(), z.number()).default({}), evaluationSource: z.string().default("TPO_GRADED") }).parse(req.body);
    const row = await assessmentSvc.finalizeResult({ attemptId: param(req, "attemptId"), institutionId: req.actor!.institutionId, ...body });
    res.json(row);
  })
);

// ---- Interventions --------------------------------------------------------

tpoRouter.post(
  "/interventions",
  requireCapability("MANAGE_INTERVENTIONS"),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        seasonId: z.string(),
        name: z.string(),
        type: z.enum(["TRAINING", "COACHING", "MOCK_INTERVIEW", "RESUME_REVIEW", "ASSESSMENT_RETAKE", "FACULTY_MENTORING", "PLACEMENT_COUNSELLING", "CUSTOM"]),
        objective: z.string(),
        targetSkillId: z.string().optional(),
        priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
      })
      .parse(req.body);
    const row = await interventionSvc.createIntervention({ ...body, institutionId: req.actor!.institutionId, createdBy: req.actor!.id });
    res.status(201).json(row);
  })
);

tpoRouter.post(
  "/interventions/:id/assign-one",
  requireCapability("MANAGE_INTERVENTIONS"),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        studentId: z.string(),
        priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
        dueDate: z.coerce.date().optional(),
        reason: z.string().optional(),
        linkedEnrollmentId: z.string().optional(),
      })
      .parse(req.body);
    const row = await interventionSvc.assignIntervention({ ...body, interventionId: param(req, "id"), institutionId: req.actor!.institutionId, assignedBy: req.actor!.id });
    res.status(201).json(row);
  })
);

tpoRouter.post(
  "/interventions/:id/assign",
  requireCapability("MANAGE_INTERVENTIONS"),
  asyncHandler(async (req, res) => {
    const { seasonId, selector, priority, dueDate } = z
      .object({ seasonId: z.string(), selector: selectorSchema, priority: z.enum(["LOW", "MEDIUM", "HIGH"]), dueDate: z.coerce.date().optional() })
      .parse(req.body);
    const studentIds = await training.resolveSelector(req.actor!.institutionId, seasonId, selector);
    const result = await interventionSvc.bulkAssignIntervention({
      interventionId: param(req, "id"),
      institutionId: req.actor!.institutionId,
      studentIds,
      assignedBy: req.actor!.id,
      priority,
      dueDate,
    });
    res.json(result);
  })
);

tpoRouter.post(
  "/interventions/assignments/:id/transition",
  requireCapability("MANAGE_INTERVENTIONS"),
  asyncHandler(async (req, res) => {
    const { toStatus } = z.object({ toStatus: z.string() }).parse(req.body);
    const row = await interventionSvc.transitionAssignmentStatus(param(req, "id"), toStatus, req.actor!.institutionId, req.actor!.id);
    res.json(row);
  })
);

tpoRouter.post(
  "/interventions/detect-overdue",
  requireCapability("MANAGE_INTERVENTIONS"),
  asyncHandler(async (req, res) => {
    res.json(await interventionSvc.detectOverdueAssignments(req.actor!.institutionId));
  })
);

tpoRouter.get(
  "/interventions/workbench",
  requireCapability("VIEW_TPO_WORKBENCH"),
  asyncHandler(async (req, res) => {
    res.json(await interventionSvc.getInterventionWorkbench(req.actor!.institutionId));
  })
);

tpoRouter.get(
  "/interventions/:id/effectiveness",
  requireCapability("VIEW_AGGREGATE_ANALYTICS"),
  asyncHandler(async (req, res) => {
    res.json(await effectiveness.getInterventionEffectiveness(param(req, "id")));
  })
);

// ---- Analytics --------------------------------------------------------

tpoRouter.get(
  "/analytics/overview",
  requireCapability("VIEW_AGGREGATE_ANALYTICS"),
  asyncHandler(async (req, res) => {
    const seasonId = z.string().parse(req.query.seasonId);
    res.json(await overview.getInstitutionOverview(req.actor!.institutionId, seasonId));
  })
);

tpoRouter.get(
  "/analytics/students-needing-intervention",
  requireCapability("VIEW_TPO_WORKBENCH"),
  asyncHandler(async (req, res) => {
    const seasonId = z.string().parse(req.query.seasonId);
    res.json(await aiTools.getStudentsNeedingIntervention(req.actor!.institutionId, seasonId));
  })
);

tpoRouter.get(
  "/analytics/department-readiness",
  requireCapability("VIEW_AGGREGATE_ANALYTICS"),
  asyncHandler(async (req, res) => {
    const { seasonId, department } = z.object({ seasonId: z.string(), department: z.string() }).parse(req.query);
    res.json(await readiness.getDepartmentReadiness(req.actor!.institutionId, seasonId, department));
  })
);

tpoRouter.get(
  "/analytics/training/:id/effectiveness",
  requireCapability("VIEW_AGGREGATE_ANALYTICS"),
  asyncHandler(async (req, res) => {
    res.json(await effectiveness.getTrainingEffectiveness(param(req, "id")));
  })
);

tpoRouter.get(
  "/analytics/insights",
  requireCapability("VIEW_TPO_WORKBENCH"),
  asyncHandler(async (req, res) => {
    const seasonId = z.string().parse(req.query.seasonId);
    res.json(await aiTools.getInsights(req.actor!.institutionId, seasonId));
  })
);
