import { test, assertEqual } from './harness';
import { prioritizeSkills } from '../src/engine/pathIntent';
import { StudentModel } from '../src/types';

test('low-confidence skill is prioritized as DIAGNOSTIC over a confidently-weak skill', () => {
  const student: StudentModel = {
    studentId: 's1',
    targetRole: 'BACKEND',
    evidenceBySkill: {},
    completedChallenges: [],
    studentModelVersion: 'v1',
    skills: {
      recursion: {
        skillId: 'recursion',
        level: 'UNCERTAIN',
        score: 55,
        confidence: 0.2,
        trend: 'INSUFFICIENT_DATA',
        lastDemonstratedAt: new Date().toISOString(),
        evidenceCount: 1,
        distinctContexts: 1,
        rawRecencyScore: 55,
        dampened: false,
      },
      debugging: {
        skillId: 'debugging',
        level: 'DEVELOPING',
        score: 35,
        confidence: 0.7,
        trend: 'STABLE',
        lastDemonstratedAt: new Date().toISOString(),
        evidenceCount: 6,
        distinctContexts: 3,
        rawRecencyScore: 35,
        dampened: false,
      },
    },
  };

  const [top] = prioritizeSkills(student);
  assertEqual(top.skillId, 'recursion', 'the low-confidence skill should be prioritized for diagnosis first');
  assertEqual(top.suggestedIntent, 'DIAGNOSTIC', 'low-confidence skill should get DIAGNOSTIC intent');
});
