import { Router } from 'express';
import type { DB } from '../../db/client.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { MasteryStateService } from '../../mastery/masteryStateService.js';
import { SkillGraphService } from '../../skillgraph/skillGraphService.js';
import { RecommendationService } from '../../recommendation/recommendationService.js';
import { ChallengeRepository } from '../../recommendation/candidateRetrieval.js';
import type { AIProvider } from '../../ai/types.js';

export function dashboardRouter(db: DB, ai: AIProvider): Router {
  const router = Router();
  const masteryState = new MasteryStateService(db);
  const skillGraph = new SkillGraphService(db);
  const recommendationService = new RecommendationService(db, ai);
  const challengeRepo = new ChallengeRepository(db);

  router.get('/', requireAuth, async (req: AuthedRequest, res) => {
    const studentId = req.studentId!;
    const states = masteryState.getAllStates(studentId);

    const withSkill = states.map((s) => ({ state: s, skill: skillGraph.getSkill(s.skillId)! })).filter((x) => x.skill);

    const bucket = (pred: (s: (typeof withSkill)[number]) => boolean) =>
      withSkill.filter(pred).map((x) => ({ skillId: x.skill.id, skillName: x.skill.name, masteryScore: x.state.masteryScore, confidenceScore: x.state.confidenceScore, masteryState: x.state.masteryState, trend: x.state.trend }));

    const strongSkills = bucket((x) => ['STRONG', 'ADVANCED', 'MASTERED'].includes(x.state.masteryState));
    const developingSkills = bucket((x) => ['DEVELOPING', 'COMPETENT'].includes(x.state.masteryState));
    const needsPractice = bucket((x) => ['INTRODUCED', 'EXPLORING'].includes(x.state.masteryState) || x.state.contradictionFlag);
    const improvingSkills = bucket((x) => x.state.trend === 'IMPROVING');
    const unknownSkills = skillGraph.getAllSkills()
      .filter((s) => s.parentSkillId !== null && !withSkill.some((x) => x.skill.id === s.id))
      .map((s) => ({ skillId: s.id, skillName: s.name, masteryScore: 0, confidenceScore: 0, masteryState: 'UNKNOWN' as const, trend: 'INSUFFICIENT_DATA' as const }));

    let recommendation = recommendationService.getPendingRecommendation(studentId);
    if (!recommendation) {
      try {
        recommendation = await recommendationService.generateRecommendation(studentId);
      } catch (err) {
        recommendation = null; // e.g. genuine content-coverage gap for this student's exact state — surfaced as null, never faked
      }
    }
    const recommendedChallenge = recommendation ? challengeRepo.getById(recommendation.challengeId) : null;

    const recentAttempts = db
      .prepare(`
        SELECT a.id, a.challenge_id, a.language, a.submitted_at, e.passed, e.tests_passed, e.tests_total, c.title
        FROM attempts a
        JOIN evaluation_results e ON e.attempt_id = a.id
        JOIN challenges c ON c.id = a.challenge_id
        WHERE a.student_id = ? ORDER BY a.submitted_at DESC LIMIT 10
      `)
      .all(studentId) as unknown as { id: string; challenge_id: string; language: string; submitted_at: string; passed: number; tests_passed: number; tests_total: number; title: string }[];

    res.json({
      strongSkills, developingSkills, needsPractice, improvingSkills, unknownSkills,
      recommendation: recommendation && recommendedChallenge ? {
        id: recommendation.id, challengeId: recommendedChallenge.id, challengeTitle: recommendedChallenge.title,
        skillId: recommendation.skillId, skillName: skillGraph.getSkill(recommendation.skillId)?.name,
        gapType: recommendation.gapType, interventionType: recommendation.interventionType,
        learningObjective: recommendation.learningObjective, reason: recommendation.reason,
        difficultyLevel: recommendedChallenge.difficultyLevel,
      } : null,
      recentProgress: recentAttempts.map((a) => ({ attemptId: a.id, challengeTitle: a.title, language: a.language, submittedAt: a.submitted_at, passed: Boolean(a.passed), testsPassed: a.tests_passed, testsTotal: a.tests_total })),
    });
  });

  return router;
}
