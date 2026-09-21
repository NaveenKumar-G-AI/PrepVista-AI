import { Router } from "express";
import { withStudentScope } from "../lib/db.js";
import { requireAuth } from "../middleware/auth.js";
import { buildMasteryMap } from "../services/masteryMapService.js";
import { getMasteryState } from "../repositories/masteryStateRepository.js";
import { listEvidenceForSkill } from "../repositories/masteryEvidenceRepository.js";
import { findSkillById } from "../repositories/skillRepository.js";
import { decideMasteryState } from "../services/masteryDecisionService.js";
import { withServiceScope } from "../lib/db.js";

export const masteryRouter = Router();

masteryRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const map = await withStudentScope(req.auth!.studentId, (client) => buildMasteryMap(client, req.auth!.studentId));
    res.json(map);
  } catch (err) {
    next(err);
  }
});

masteryRouter.get("/:skillId", requireAuth, async (req, res, next) => {
  try {
    const { skillId } = req.params;
    const [skill, state] = await Promise.all([
      withServiceScope((client) => findSkillById(client, skillId)),
      withStudentScope(req.auth!.studentId, (client) => getMasteryState(client, req.auth!.studentId, skillId)),
    ]);
    if (!skill) {
      res.status(404).json({ error: "Skill not found." });
      return;
    }
    const fallbackState = {
      state: "UNKNOWN" as const,
      confidence: "LOW" as const,
      conceptScore: null,
      executionScore: null,
      transferScore: null,
      retentionScore: null,
      timedScore: null,
      consistencyScore: null,
      lastVerifiedAt: null,
      nextReviewAt: null,
    };
    res.json({ skill, state: state ?? fallbackState });
  } catch (err) {
    next(err);
  }
});

masteryRouter.get("/:skillId/evidence", requireAuth, async (req, res, next) => {
  try {
    const { skillId } = req.params;
    const evidence = await withStudentScope(req.auth!.studentId, (client) => listEvidenceForSkill(client, req.auth!.studentId, skillId));
    res.json({ evidence });
  } catch (err) {
    next(err);
  }
});

/**
 * Spec sections 8 & 21: "why does ACEAPT believe this?" Recomputes the
 * decision fresh from stored evidence (read-only - this never writes to
 * mastery_state) so the explanation always matches what's actually on file,
 * with a full rationale trail rather than just a final number.
 */
masteryRouter.get("/:skillId/explain", requireAuth, async (req, res, next) => {
  try {
    const { skillId } = req.params;
    const decision = await withStudentScope(req.auth!.studentId, async (client) => {
      const state = await getMasteryState(client, req.auth!.studentId, skillId);
      const evidence = await listEvidenceForSkill(client, req.auth!.studentId, skillId);
      return decideMasteryState({ previousState: state?.state ?? "UNKNOWN", previousVerifiedSnapshot: state?.verifiedSnapshot ?? null, evidence });
    });
    res.json(decision);
  } catch (err) {
    next(err);
  }
});
