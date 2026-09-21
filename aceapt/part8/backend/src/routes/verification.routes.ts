import { Router } from "express";
import { z } from "zod";
import { withStudentScope, withServiceScope } from "../lib/db.js";
import { requireAuth } from "../middleware/auth.js";
import { findSkillById } from "../repositories/skillRepository.js";
import { logSystemEvent } from "../repositories/systemEventRepository.js";
import {
  startVerificationSession,
  getCurrentQuestion,
  submitAnswer,
  completeVerificationSession,
  abandonVerificationSession,
} from "../services/masteryVerificationService.js";
import { genId } from "../lib/ids.js";

export const verificationRouter = Router();

const startSchema = z.object({
  objective: z.enum(["PROVISIONAL_CHECK", "VERIFY_TRANSFER", "STABILITY_CHECK", "MAINTENANCE_CHECK", "DELAYED_VERIFICATION", "RECOVERY_CHECK"]).optional(),
});

verificationRouter.post("/:skillId/verify/start", requireAuth, async (req, res, next) => {
  try {
    const { skillId } = req.params;
    const { objective } = startSchema.parse(req.body ?? {});
    const skill = await withServiceScope((client) => findSkillById(client, skillId));
    if (!skill) {
      res.status(404).json({ error: "Skill not found." });
      return;
    }

    const attempt = await withStudentScope(req.auth!.studentId, (client) =>
      startVerificationSession(client, { studentId: req.auth!.studentId, skillId, skillKey: skill.key, skillName: skill.name, objective })
    );

    await withServiceScope((client) =>
      logSystemEvent(client, { id: genId(), eventType: "verification_started", studentId: req.auth!.studentId, skillId, payload: { attemptId: attempt.id, objective: attempt.objective } })
    );

    res.status(201).json({ attemptId: attempt.id, objective: attempt.objective, totalQuestions: attempt.questionPlan.length });
  } catch (err) {
    next(err);
  }
});

verificationRouter.get("/verify/:attemptId", requireAuth, async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const view = await withStudentScope(req.auth!.studentId, async (client) => {
      // skillName is only used for display when the session is LABELED, so a
      // lightweight lookup here is fine.
      const current = await getCurrentQuestion(client, attemptId, "");
      return current;
    });
    if (!view) {
      res.status(404).json({ error: "No active question for this attempt (it may be completed, abandoned, or invalid)." });
      return;
    }
    res.json(view);
  } catch (err) {
    next(err);
  }
});

const answerSchema = z.object({
  skillId: z.string().min(1),
  studentAnswer: z.string().min(1),
  timeTakenSeconds: z.number().int().positive().max(3600),
});

verificationRouter.post("/verify/:attemptId/answer", requireAuth, async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const input = answerSchema.parse(req.body);
    const result = await withStudentScope(req.auth!.studentId, (client) =>
      submitAnswer(client, { attemptId, studentId: req.auth!.studentId, skillId: input.skillId, studentAnswer: input.studentAnswer, timeTakenSeconds: input.timeTakenSeconds })
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const completeSchema = z.object({ skillId: z.string().min(1) });

verificationRouter.post("/verify/:attemptId/complete", requireAuth, async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const { skillId } = completeSchema.parse(req.body);
    const result = await withStudentScope(req.auth!.studentId, (client) => completeVerificationSession(client, attemptId, req.auth!.studentId, skillId));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

verificationRouter.post("/verify/:attemptId/abandon", requireAuth, async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    await withStudentScope(req.auth!.studentId, (client) => abandonVerificationSession(client, attemptId));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
