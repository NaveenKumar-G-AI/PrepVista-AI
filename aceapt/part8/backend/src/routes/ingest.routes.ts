import { Router } from "express";
import { z } from "zod";
import { withStudentScope, withServiceScope } from "../lib/db.js";
import { requireServiceKey } from "../middleware/serviceAuth.js";
import { createEvidence } from "../repositories/masteryEvidenceRepository.js";
import { recomputeAndPersistMasteryState } from "../services/masteryEvidenceService.js";
import { findStudentById } from "../repositories/studentRepository.js";
import { findSkillById } from "../repositories/skillRepository.js";
import { genId } from "../lib/ids.js";

export const ingestRouter = Router();

const ingestSchema = z.object({
  studentId: z.string().min(1),
  skillId: z.string().min(1),
  evidenceType: z.enum(["PRACTICE", "ASSESSMENT", "VARIATION", "TRANSFER", "DELAYED", "MIXED_CONTEXT"]),
  score: z.number().min(0).max(1),
  difficulty: z.number().min(0).max(1).default(0.5),
  timed: z.boolean().default(false),
  timeTakenSeconds: z.number().int().positive().optional(),
  expectedTimeSeconds: z.number().int().positive().optional(),
  contextType: z.enum(["LABELED", "MIXED_CONTEXT", "REAL_WORLD"]).default("LABELED"),
  noveltyLevel: z.enum(["FAMILIAR", "SLIGHTLY_VARIANT", "NOVEL", "COMPLEX_APPLICATION"]).default("FAMILIAR"),
  source: z.string().min(1),
});

/**
 * Spec sections 33/34: Feature 5's practice results and Feature 6's
 * assessment results are legitimate mastery evidence too - Feature 8 isn't
 * only fed by its own verification sessions. This endpoint does NOT go
 * through exposure tracking (question_exposures is keyed to ACEAPT's own
 * question ids, which an external feature's items won't have) - it records
 * evidence directly and recomputes state exactly like any other evidence
 * source, keeping the decision engine single-pathed.
 */
ingestRouter.post("/evidence", requireServiceKey, async (req, res, next) => {
  try {
    const input = ingestSchema.parse(req.body);

    const [student, skill] = await withServiceScope(async (client) => [await findStudentById(client, input.studentId), await findSkillById(client, input.skillId)]);
    if (!student) {
      res.status(404).json({ error: "Unknown studentId." });
      return;
    }
    if (!skill) {
      res.status(404).json({ error: "Unknown skillId." });
      return;
    }

    const outcome = await withStudentScope(input.studentId, async (client) => {
      await createEvidence(client, {
        id: genId(),
        studentId: input.studentId,
        skillId: input.skillId,
        evidenceType: input.evidenceType,
        score: input.score,
        difficulty: input.difficulty,
        timed: input.timed,
        timeTakenSeconds: input.timeTakenSeconds ?? null,
        expectedTimeSeconds: input.expectedTimeSeconds ?? null,
        contextType: input.contextType,
        noveltyLevel: input.noveltyLevel,
        source: input.source,
      });
      return recomputeAndPersistMasteryState(client, input.studentId, input.skillId);
    });

    res.status(201).json({ state: outcome.decision.state, confidence: outcome.decision.confidence, stateChanged: outcome.stateChanged });
  } catch (err) {
    next(err);
  }
});
