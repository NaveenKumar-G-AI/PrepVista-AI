import { Router } from "express";
import { z } from "zod";
import { ConfidenceLevel, PracticeMode, RetryType } from "../../domain/enums";
import { PracticeOrchestrator } from "../../services/practiceOrchestrator";
import { attemptRateLimiter, requireAuth, validateBody } from "../middleware";

export const sessionsRouter = Router();

sessionsRouter.get("/sessions/active", requireAuth, async (req, res, next) => {
  try {
    const result = await PracticeOrchestrator.getActiveSession(req.user!.studentId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const startSchema = z.object({ mode: z.nativeEnum(PracticeMode).optional() });
sessionsRouter.post("/sessions", requireAuth, validateBody(startSchema), async (req, res, next) => {
  try {
    const result = await PracticeOrchestrator.startSession(req.user!.studentId, req.body.mode);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

sessionsRouter.get("/sessions/:id", requireAuth, async (req, res, next) => {
  try {
    const summary = await PracticeOrchestrator.getSummary(req.user!.studentId, req.params.id);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

sessionsRouter.post("/sessions/:id/hints", requireAuth, async (req, res, next) => {
  try {
    const result = await PracticeOrchestrator.getHint(req.user!.studentId, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const attemptSchema = z.object({
  selectedOptionId: z.string().nullable(),
  timeToStartMs: z.number().int().min(0).max(10 * 60_000).default(0),
  confidence: z.nativeEnum(ConfidenceLevel).nullable().optional(),
});
sessionsRouter.post("/sessions/:id/attempts", requireAuth, attemptRateLimiter, validateBody(attemptSchema), async (req, res, next) => {
  try {
    const result = await PracticeOrchestrator.submitAttempt(req.user!.studentId, req.params.id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const advanceSchema = z.object({ retryType: z.nativeEnum(RetryType).optional() });
sessionsRouter.post("/sessions/:id/advance", requireAuth, validateBody(advanceSchema), async (req, res, next) => {
  try {
    const result = await PracticeOrchestrator.advanceSession(req.user!.studentId, req.params.id, req.body.retryType);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

sessionsRouter.post("/sessions/:id/complete", requireAuth, async (req, res, next) => {
  try {
    const result = await PracticeOrchestrator.completeSession(req.user!.studentId, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
