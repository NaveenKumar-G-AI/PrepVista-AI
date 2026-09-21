import { test, assertEqual, assertTrue } from './harness';
import { applyHardConstraints, applyPrerequisiteFilter } from '../src/engine/filters';
import { ChallengeMetadata, StudentModel, SelectionContext } from '../src/types';

function mkChallenge(overrides: Partial<ChallengeMetadata>): ChallengeMetadata {
  return {
    challengeId: 'ch1',
    topic: 'sliding-window',
    subtopics: [],
    learningObjectives: [],
    primarySkillId: 'sliding_window',
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
    estimatedTimeMinutes: 25,
    supportedLanguages: ['python', 'javascript'],
    challengeFamily: 'sliding-window',
    familyTier: 'BASIC',
    transferGroup: 'sliding-window',
    curriculumTags: [],
    status: 'ACTIVE',
    isDiagnostic: false,
    ...overrides,
  };
}
function baseStudent(overrides: Partial<StudentModel> = {}): StudentModel {
  return {
    studentId: 's1',
    targetRole: null,
    skills: {},
    evidenceBySkill: {},
    completedChallenges: [],
    studentModelVersion: 'v1',
    ...overrides,
  };
}
const ctx: SelectionContext = { mode: 'PRACTICE' };

test('DRAFT challenges are excluded by hard constraints', () => {
  const result = applyHardConstraints([mkChallenge({ status: 'DRAFT' })], baseStudent(), ctx, {});
  assertEqual(result.survivors.length, 0, 'DRAFT challenge must be excluded');
});

test('unsupported language is excluded by hard constraints', () => {
  const result = applyHardConstraints(
    [mkChallenge({ supportedLanguages: ['java'] })],
    baseStudent(),
    { mode: 'PRACTICE', language: 'python' },
    {}
  );
  assertEqual(result.survivors.length, 0, 'challenge without the requested language must be excluded');
});

test('role-scoped challenge is excluded when it does not match the student target role', () => {
  const student = baseStudent({ targetRole: 'BACKEND' });
  const frontendOnly = mkChallenge({ challengeId: 'frontend-only', targetRoles: ['FRONTEND'] });
  const result = applyHardConstraints([frontendOnly], student, ctx, {});
  assertEqual(result.survivors.length, 0, 'challenge scoped to a different role should be excluded');
});

test('unmet prerequisite is excluded unless the challenge is diagnostic', () => {
  const student = baseStudent();
  const gated = mkChallenge({ challengeId: 'gated', prerequisites: ['arrays'] });
  const diagnostic = mkChallenge({ challengeId: 'diag', prerequisites: ['arrays'], isDiagnostic: true });
  const result = applyPrerequisiteFilter([gated, diagnostic], student);
  assertTrue(!result.survivors.some((c) => c.challengeId === 'gated'), 'gated challenge should be filtered out');
  assertTrue(result.survivors.some((c) => c.challengeId === 'diag'), 'diagnostic challenge should bypass the prerequisite gate');
});
