import { Router, type Response } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { AccuracyProfileService } from "../../services/AccuracyProfileService.js";
import { AccuracyTrainingEngine } from "../../services/AccuracyTrainingEngine.js";
import { SelfCorrectionService } from "../../services/SelfCorrectionService.js";
import { ErrorPatternIntegrationService } from "../../services/ErrorPatternIntegrationService.js";
import { ERROR_TYPES } from "../../types/errorTaxonomy.js";
import { TRAINING_TYPES, SESSION_STATES } from "../../types/training.js";
import { ValidationError } from "../../errors.js";

export const router = Router();
router.use(requireAuth);

const profileService = new AccuracyProfileService();
const trainingEngine = new AccuracyTrainingEngine();
const selfCorrectionService = new SelfCorrectionService();
const errorPatternService = new ErrorPatternIntegrationService();

function studentIdOf(req: AuthedRequest): string {
  if (!req.studentId) throw new ValidationError("Missing student context");
  return req.studentId;
}

function send(res: Response, data: unknown, status = 200) {
  res.status(status).json({ data });
}

// ── getAccuracyProfile / getAccuracyBottlenecks ─────────────────────────
router.get("/profile", async (req: AuthedRequest, res, next) => {
  try {
    send(res, await profileService.getProfile(studentIdOf(req)));
  } catch (err) {
    next(err);
  }
});

router.get("/dashboard", async (req: AuthedRequest, res, next) => {
  try {
    send(res, await profileService.getDashboard(studentIdOf(req)));
  } catch (err) {
    next(err);
  }
});

router.get("/bottlenecks", async (req: AuthedRequest, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    send(res, await profileService.getBottlenecks(studentIdOf(req), limit));
  } catch (err) {
    next(err);
  }
});

router.get("/error-pattern-card", async (req: AuthedRequest, res, next) => {
  try {
    send(res, await errorPatternService.getErrorPatternCard(studentIdOf(req)));
  } catch (err) {
    next(err);
  }
});

// ── startAccuracyTraining ────────────────────────────────────────────────
const StartTrainingSchema = z.object({
  trainingType: z.enum(TRAINING_TYPES),
  targetSkillId: z.string().uuid().nullish(),
  targetErrorType: z.enum(ERROR_TYPES).nullish(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  mode: z.enum(["guided", "independent"]).optional(),
  questionPlan: z.array(z.string().uuid()).min(1)
});

router.post("/training", async (req: AuthedRequest, res, next) => {
  try {
    const body = StartTrainingSchema.parse(req.body);
    const session = await trainingEngine.startTraining(studentIdOf(req), {
      trainingType: body.trainingType,
      targetSkillId: body.targetSkillId ?? null,
      targetErrorType: body.targetErrorType ?? null,
      difficulty: body.difficulty,
      mode: body.mode,
      questionPlan: body.questionPlan
    });
    send(res, session, 201);
  } catch (err) {
    next(err);
  }
});

router.get("/training/active", async (req: AuthedRequest, res, next) => {
  try {
    send(res, await trainingEngine.getActiveSession(studentIdOf(req)));
  } catch (err) {
    next(err);
  }
});

// ── getAccuracyProgress ──────────────────────────────────────────────────
router.get("/training/:sessionId", async (req: AuthedRequest, res, next) => {
  try {
    send(res, await trainingEngine.getSessionDetail(studentIdOf(req), req.params.sessionId!));
  } catch (err) {
    next(err);
  }
});

// ── submitAccuracyAttempt ────────────────────────────────────────────────
const SubmitAttemptSchema = z.object({
  questionId: z.string().uuid(),
  skillId: z.string().uuid(),
  submittedAnswer: z.unknown(),
  isCorrect: z.boolean(),
  errorType: z.enum(ERROR_TYPES).nullish(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  isNovel: z.boolean().optional(),
  hintLevel: z.enum(["independent", "guided", "hint_used"]).optional(),
  responseTimeMs: z.number().int().positive().nullish(),
  expectedTimeMs: z.number().int().positive().nullish(),
  selfCorrected: z.boolean().optional(),
  questionValid: z.boolean().optional(),
  stepResults: z.array(z.object({ step: z.number().int(), correct: z.boolean() })).nullish()
});

router.post("/training/:sessionId/attempts/:sequenceNumber", async (req: AuthedRequest, res, next) => {
  try {
    const body = SubmitAttemptSchema.parse(req.body);
    const sequenceNumber = Number(req.params.sequenceNumber);
    if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1) {
      throw new ValidationError("sequenceNumber must be a positive integer");
    }
    const feedback = await trainingEngine.submitAttempt(studentIdOf(req), req.params.sessionId!, sequenceNumber, body);
    send(res, feedback);
  } catch (err) {
    next(err);
  }
});

// ── advance / pause / resume / abandon / completeAccuracyTraining ──────────
const TransitionSchema = z.object({ to: z.enum(SESSION_STATES) });

router.post("/training/:sessionId/transition", async (req: AuthedRequest, res, next) => {
  try {
    const { to } = TransitionSchema.parse(req.body);
    send(res, await trainingEngine.transitionSession(studentIdOf(req), req.params.sessionId!, to));
  } catch (err) {
    next(err);
  }
});

// ── submitSelfCorrection ─────────────────────────────────────────────────
const SelfCheckSchema = z.object({
  check: z.enum(["PROBABILITY_RANGE", "PERCENTAGE_RANGE", "MAGNITUDE_SANITY", "SIGN_CHECK", "UNIT_CHECK"]),
  resultValue: z.number(),
  studentSaysFlag: z.boolean()
});

router.post("/self-check", async (req: AuthedRequest, res, next) => {
  try {
    const body = SelfCheckSchema.parse(req.body);
    send(
      res,
      selfCorrectionService.checkReasonableness(studentIdOf(req), body.check, body.resultValue, body.studentSaysFlag)
    );
  } catch (err) {
    next(err);
  }
});

// ── submitErrorIdentification (error-spotting) ───────────────────────────
const ErrorSpottingSchema = z.object({ studentSelectedStep: z.number().int().positive() });

router.post("/training/:sessionId/attempts/:sequenceNumber/error-spotting", async (req: AuthedRequest, res, next) => {
  try {
    const body = ErrorSpottingSchema.parse(req.body);
    const sequenceNumber = Number(req.params.sequenceNumber);
    send(
      res,
      await selfCorrectionService.submitErrorSpotting(
        studentIdOf(req),
        req.params.sessionId!,
        sequenceNumber,
        body.studentSelectedStep
      )
    );
  } catch (err) {
    next(err);
  }
});

// ── error-correction (fix-selection) ─────────────────────────────────────
const ErrorCorrectionSchema = z.object({
  studentSelectedFix: z.enum([
    "CONCEPT_REINFORCEMENT",
    "STRATEGY_SELECTION_DRILL",
    "FORMULA_RECOGNITION_DRILL",
    "CALCULATION_PRECISION_DRILL",
    "VALUE_MAPPING_DRILL",
    "QUESTION_UNDERSTANDING_DRILL",
    "REASONING_DRILL",
    "CONDITION_TRACKING_DRILL",
    "ERROR_CHECK_DRILL",
    "BRIDGE_NOVEL_PRACTICE",
    "UNIT_AWARENESS_FEEDBACK",
    "NEEDS_INVESTIGATION"
  ])
});

router.post("/training/:sessionId/attempts/:sequenceNumber/error-correction", async (req: AuthedRequest, res, next) => {
  try {
    const body = ErrorCorrectionSchema.parse(req.body);
    const sequenceNumber = Number(req.params.sequenceNumber);
    send(
      res,
      await selfCorrectionService.submitErrorCorrectionChoice(
        studentIdOf(req),
        req.params.sessionId!,
        sequenceNumber,
        body.studentSelectedFix
      )
    );
  } catch (err) {
    next(err);
  }
});
