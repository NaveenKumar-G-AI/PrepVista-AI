import { test, assertEqual } from './harness';
import { selectNextChallenge } from '../src/engine/selector';
import {
  InMemoryChallengeCatalog,
  InMemoryStudentSkillModel,
  InMemoryCurriculum,
  InMemoryAuditLog,
} from '../src/integration/inMemoryAdapters';
import { ChallengeMetadata, StudentModel } from '../src/types';

function mkChallenge(id: string, tags: string[] = []): ChallengeMetadata {
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
    challengeFamily: id,
    familyTier: 'BASIC',
    transferGroup: id,
    curriculumTags: tags,
    status: 'ACTIVE',
    isDiagnostic: false,
  };
}
function mkStudent(overrides: Partial<StudentModel> = {}): StudentModel {
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

test('instructor-required curriculum tags exclude out-of-scope challenges', async () => {
  const pool = [mkChallenge('in-scope', ['graphs']), mkChallenge('out-of-scope', ['recursion'])];
  const student = mkStudent({ curriculumConstraints: { requiredCurriculumTags: ['graphs'] } });
  const ports = {
    challengeCatalog: new InMemoryChallengeCatalog(pool),
    studentSkillModel: new InMemoryStudentSkillModel({ [student.studentId]: student }),
    curriculum: new InMemoryCurriculum(),
    auditLog: new InMemoryAuditLog(),
  };
  const { nextBestChallenge } = await selectNextChallenge(student.studentId, { mode: 'PRACTICE' }, ports);
  assertEqual(nextBestChallenge!.challengeId, 'in-scope', `only the in-scope challenge should be eligible, got ${nextBestChallenge?.challengeId}`);
});

test('an active instructor override supersedes automatic selection', async () => {
  const pool = [mkChallenge('normal-pick')];
  const student = mkStudent();
  const ports = {
    challengeCatalog: new InMemoryChallengeCatalog(pool),
    studentSkillModel: new InMemoryStudentSkillModel({ [student.studentId]: student }),
    curriculum: new InMemoryCurriculum({
      [student.studentId]: { challengeId: 'instructor-assigned', reason: "Complete this week's graph assignment." },
    }),
    auditLog: new InMemoryAuditLog(),
  };
  const { nextBestChallenge } = await selectNextChallenge(student.studentId, { mode: 'PRACTICE' }, ports);
  assertEqual(nextBestChallenge!.challengeId, 'instructor-assigned', 'manual override must supersede automatic ranking');
});
