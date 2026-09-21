import { test, assertEqual } from './harness';
import { applyRepetitionFilter } from '../src/engine/filters';
import { ChallengeMetadata, StudentModel } from '../src/types';

function mkChallenge(id: string): ChallengeMetadata {
  return {
    challengeId: id,
    topic: 't',
    subtopics: [],
    learningObjectives: [],
    primarySkillId: 's',
    supportingSkillIds: [],
    difficulty: {
      algorithm: 40,
      implementation: 40,
      reasoning: 40,
      state: 40,
      debugging: 40,
      constraints: 40,
      edgeCases: 40,
      transfer: 40,
    },
    prerequisites: [],
    targetRoles: [],
    estimatedTimeMinutes: 20,
    supportedLanguages: ['python'],
    challengeFamily: 'fam',
    familyTier: 'BASIC',
    transferGroup: 'fam',
    curriculumTags: [],
    status: 'ACTIVE',
    isDiagnostic: false,
  };
}

test('a completed challenge is excluded without an explicit repetition reason', () => {
  const student: StudentModel = {
    studentId: 's1',
    targetRole: null,
    skills: {},
    evidenceBySkill: {},
    studentModelVersion: 'v1',
    completedChallenges: [
      {
        challengeId: 'ch1',
        challengeFamily: 'fam',
        transferGroup: 'fam',
        completedAt: new Date().toISOString(),
        outcome: 'SUCCESS',
        reasonCompleted: 'STANDARD',
      },
    ],
  };
  const result = applyRepetitionFilter([mkChallenge('ch1')], student, { mode: 'PRACTICE' });
  assertEqual(result.survivors.length, 0, 'completed challenge should be excluded by default');
});

test('a completed challenge is allowed back in with an explicit repetition reason', () => {
  const student: StudentModel = {
    studentId: 's1',
    targetRole: null,
    skills: {},
    evidenceBySkill: {},
    studentModelVersion: 'v1',
    completedChallenges: [
      {
        challengeId: 'ch1',
        challengeFamily: 'fam',
        transferGroup: 'fam',
        completedAt: new Date().toISOString(),
        outcome: 'FAILURE',
        reasonCompleted: 'STANDARD',
      },
    ],
  };
  const result = applyRepetitionFilter([mkChallenge('ch1')], student, {
    mode: 'PRACTICE',
    requestedRepetitionReason: 'REMEDIATION',
  });
  assertEqual(result.survivors.length, 1, 'explicit remediation reason should allow repetition');
});
