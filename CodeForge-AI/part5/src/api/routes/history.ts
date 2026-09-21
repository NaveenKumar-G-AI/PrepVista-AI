import { Router } from 'express';
import type { DB } from '../../db/client.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { EvidenceService } from '../../evidence/evidenceService.js';
import { SkillGraphService } from '../../skillgraph/skillGraphService.js';

export function historyRouter(db: DB): Router {
  const router = Router();
  const evidenceService = new EvidenceService(db);
  const skillGraph = new SkillGraphService(db);

  router.get('/:skillId', requireAuth, (req: AuthedRequest, res) => {
    const skill = skillGraph.getSkill(req.params.skillId);
    if (!skill) { res.status(404).json({ error: 'Unknown skill' }); return; }
    // studentId from the verified token only — a student can never pull another student's timeline (Phase 50).
    const evidence = evidenceService.getEvidenceForSkill(req.studentId!, skill.id);
    res.json({
      skillId: skill.id, skillName: skill.name,
      timeline: evidence.map((e) => ({
        createdAt: e.createdAt, rawScore: e.rawScore, difficultyScore: e.difficultyScore, independent: e.independent,
        mistakeCategory: e.mistakeCategory, languageIssue: e.languageIssue, contextType: e.contextType, challengeId: e.challengeId,
      })),
    });
  });

  return router;
}
