import { test, assertEqual } from './harness';
import { prioritizeSkills } from '../src/engine/pathIntent';
import { StudentModel, SkillState } from '../src/types';

function mkMasteredButStale(): SkillState {
  return {
    skillId: 'binary_search',
    level: 'MASTERED',
    score: 90,
    confidence: 0.8,
    trend: 'STABLE',
    lastDemonstratedAt: new Date(Date.now() - 70 * 86_400_000).toISOString(),
    evidenceCount: 6,
    distinctContexts: 4,
    rawRecencyScore: 90,
    dampened: false,
  };
}

test('a mastered-but-stale skill is prioritized for reinforcement, not treated as a fresh gap', () => {
  const student: StudentModel = {
    studentId: 's1',
    targetRole: null,
    evidenceBySkill: {},
    completedChallenges: [],
    studentModelVersion: 'v1',
    skills: { binary_search: mkMasteredButStale() },
  };
  const [top] = prioritizeSkills(student);
  assertEqual(top.skillId, 'binary_search', 'the stale mastered skill should surface');
  assertEqual(top.suggestedIntent, 'REINFORCEMENT', `expected REINFORCEMENT intent for stale mastery, got ${top.suggestedIntent}`);
});
