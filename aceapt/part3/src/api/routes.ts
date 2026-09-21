import { Router } from 'express';
import { z } from 'zod';
import { repo } from '../store/repository.js';
import { SKILLS, RELATIONSHIPS } from '../domain/taxonomy.js';
import { computeStudentSkillProfile } from '../engine/profile.js';
import { generateNarrative } from '../ai/narrative.js';
import { TemplateProvider } from '../ai/provider.js';
import { genId } from '../domain/id.js';
import { demoSessionAuth, requireOwnStudentId } from './auth.js';
import type { SkillEvidence } from '../domain/types.js';

export const router = Router();

// In the real product this comes from Feature 1 (stated goal + timeline).
// Hardcoded here since this reference implementation has no Feature 1 UI.
const DEFAULT_TARGET = { targetDomains: ['Quantitative'] as const, daysToTarget: 21 };

router.get('/taxonomy', (_req, res) => {
  res.json({ skills: SKILLS, relationships: RELATIONSHIPS });
});

router.get('/profile/:studentId', demoSessionAuth, requireOwnStudentId('studentId'), (req, res) => {
  const profile = computeStudentSkillProfile(req.params.studentId, repo, {
    targetDomains: [...DEFAULT_TARGET.targetDomains],
    daysToTarget: DEFAULT_TARGET.daysToTarget,
  });
  repo.save();
  res.json(profile);
});

router.get('/skill/:studentId/:skillId', demoSessionAuth, requireOwnStudentId('studentId'), (req, res) => {
  const skill = SKILLS.find((s) => s.id === req.params.skillId);
  if (!skill) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const state = repo.getState(req.params.studentId, skill.id);
  const evidence = repo.getEvidenceForSkill(req.params.studentId, skill.id);
  const prerequisites = RELATIONSHIPS.filter((r) => r.toSkillId === skill.id && r.type === 'PREREQUISITE_OF');
  const related = RELATIONSHIPS.filter((r) => r.fromSkillId === skill.id || r.toSkillId === skill.id);
  res.json({ skill, state, evidenceCount: evidence.length, prerequisites, related });
});

const EvidenceInput = z.object({
  skillId: z.string(),
  role: z.enum(['primary_skill', 'supporting_skill']),
  questionId: z.string(),
  questionAttemptId: z.string(),
  correct: z.boolean(),
  difficulty: z.number().min(1).max(5),
  cognitiveLevel: z.enum(['foundation', 'application', 'transfer']),
  timeTakenMs: z.number().min(0),
  expectedTimeMs: z.number().min(0),
  statedConfidence: z.enum(['low', 'medium', 'high']).optional(),
  source: z.enum(['diagnostic', 'practice', 'retest']),
  sessionId: z.string(),
});

router.post('/evidence/:studentId', demoSessionAuth, requireOwnStudentId('studentId'), (req, res) => {
  const parsed = EvidenceInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_evidence', issues: parsed.error.issues });
    return;
  }
  const evidence: SkillEvidence = {
    id: genId('ev'),
    studentId: req.params.studentId,
    createdAt: new Date().toISOString(),
    ...parsed.data,
  };
  const accepted = repo.addEvidence(evidence);
  repo.save();
  res.status(accepted ? 201 : 200).json({
    accepted,
    evidenceId: evidence.id,
    note: accepted ? undefined : 'Duplicate questionAttemptId — ignored for idempotency.',
  });
});

router.get('/insight/:studentId/:skillId', demoSessionAuth, requireOwnStudentId('studentId'), async (req, res) => {
  const skill = SKILLS.find((s) => s.id === req.params.skillId);
  const state = repo.getState(req.params.studentId, req.params.skillId);
  if (!skill || !state) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const evidence = repo.getEvidenceForSkill(req.params.studentId, skill.id);
  const hint = (req.query.hint as 'hidden_strength' | 'overconfidence_flag' | 'recommended_focus' | 'general' | undefined) ?? 'general';
  const insight = await generateNarrative(req.params.studentId, new TemplateProvider(), { skill, state, evidence, hint });
  repo.addInsight(insight);
  repo.save();
  res.json(insight);
});
