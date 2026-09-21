import { Router } from 'express';
import { MasteryService } from '../../services/MasteryService.js';
import { SkillGraphRepository } from '../../repositories/SkillGraphRepository.js';
import type { AuthedRequest } from '../middleware/auth.js';

const router = Router();
const masteryService = new MasteryService();
const skillGraphRepo = new SkillGraphRepository();

// GET /skills/:key/state — current mastery state + confidence for one skill.
router.get('/:key/state', async (req: AuthedRequest, res) => {
  const skill = await skillGraphRepo.getSkillByKey(req.params.key as string);
  if (!skill) return res.status(404).json({ error: 'Unknown skill key' });
  const state = await masteryService.getState(req.studentId!, skill.id);
  res.json({ skill, state: state ?? { masteryState: 'UNKNOWN', confidence: 0 } });
});

export default router;
