import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../../db/client.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { CandidateRetrieval } from '../../recommendation/candidateRetrieval.js';
import { MasteryStateService } from '../../mastery/masteryStateService.js';
import { EvidenceService } from '../../evidence/evidenceService.js';
import { SkillGraphService } from '../../skillgraph/skillGraphService.js';
import { detectGap, rankGapsBySeverity } from '../../gaps/gapDetector.js';

const QuerySchema = z.object({
  mode: z.enum(['RECOMMENDED', 'CHOOSE_SKILL', 'WEAK_AREA', 'RANDOM_PRACTICE', 'INTERVIEW_MODE']),
  skillId: z.string().optional(),
  language: z.enum(['javascript', 'python']).optional(),
});

export function practiceRouter(db: DB): Router {
  const router = Router();
  const candidateRetrieval = new CandidateRetrieval(db);
  const masteryState = new MasteryStateService(db);
  const evidenceService = new EvidenceService(db);
  const skillGraph = new SkillGraphService(db);

  router.get('/options', requireAuth, (req: AuthedRequest, res) => {
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() }); return; }
    const studentId = req.studentId!;
    const { mode, skillId, language } = parsed.data;

    let challenges;
    switch (mode) {
      case 'CHOOSE_SKILL': {
        if (!skillId) { res.status(400).json({ error: 'skillId is required for CHOOSE_SKILL mode' }); return; }
        challenges = candidateRetrieval.retrieve({ skillId, language });
        break;
      }
      case 'WEAK_AREA': {
        const states = masteryState.getAllStates(studentId);
        const gaps = rankGapsBySeverity(
          states.map((s) => detectGap(s, evidenceService.getEvidenceForSkill(studentId, s.skillId))).filter((g): g is NonNullable<typeof g> => g !== null && g.gapType !== 'INSUFFICIENT_EVIDENCE'),
        );
        const targetSkillId = gaps[0]?.skillId;
        challenges = targetSkillId ? candidateRetrieval.retrieve({ skillId: targetSkillId, language }) : [];
        break;
      }
      case 'INTERVIEW_MODE': {
        challenges = candidateRetrieval.retrieve({ language }).filter((c) => c.difficultyLevel === 'MEDIUM' || c.difficultyLevel === 'HARD' || c.difficultyLevel === 'ADVANCED');
        break;
      }
      case 'RANDOM_PRACTICE':
      case 'RECOMMENDED':
      default: {
        challenges = candidateRetrieval.retrieve({ language });
        break;
      }
    }

    res.json({
      mode,
      options: challenges.map((c) => ({
        challengeId: c.id, title: c.title, skillId: c.primarySkillId, skillName: skillGraph.getSkill(c.primarySkillId)?.name,
        difficultyLevel: c.difficultyLevel, languagesSupported: c.languagesSupported, contextType: c.contextType,
      })),
    });
  });

  return router;
}
