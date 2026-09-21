import { test, assertEqual, assertTrue } from './harness';
import { ChallengeMetadata, StudentModel, SkillEvidencePoint } from '../src/types';
import {
  InMemoryChallengeCatalog,
  InMemoryStudentSkillModel,
  InMemoryCurriculum,
  InMemoryAuditLog,
} from '../src/integration/inMemoryAdapters';
import { selectNextChallenge } from '../src/engine/selector';
import { computeSkillState } from '../src/evidence/aggregateEvidence';

function baseDims(overrides: Partial<ChallengeMetadata['difficulty']> = {}): ChallengeMetadata['difficulty'] {
  return {
    algorithm: 40,
    implementation: 40,
    reasoning: 40,
    state: 40,
    debugging: 40,
    constraints: 40,
    edgeCases: 40,
    transfer: 40,
    ...overrides,
  };
}

function buildPool(): ChallengeMetadata[] {
  return [
    {
      challengeId: 'basic-algo',
      topic: 'two-pointers',
      subtopics: [],
      learningObjectives: ['two pointer basics'],
      primarySkillId: 'algorithms',
      supportingSkillIds: [],
      difficulty: baseDims({ algorithm: 35, state: 20 }),
      prerequisites: [],
      targetRoles: [],
      estimatedTimeMinutes: 15,
      supportedLanguages: ['python'],
      challengeFamily: 'two-pointers',
      familyTier: 'BASIC',
      transferGroup: 'two-pointers',
      curriculumTags: [],
      status: 'ACTIVE',
      isDiagnostic: false,
    },
    {
      challengeId: 'state-variation',
      topic: 'sliding-window',
      subtopics: [],
      learningObjectives: ['state transition tracking'],
      primarySkillId: 'state_reasoning',
      supportingSkillIds: ['algorithms'],
      difficulty: baseDims({ algorithm: 40, state: 65 }),
      prerequisites: [],
      targetRoles: ['BACKEND'],
      estimatedTimeMinutes: 25,
      supportedLanguages: ['python'],
      challengeFamily: 'sliding-window',
      familyTier: 'INTERMEDIATE',
      transferGroup: 'sliding-window',
      curriculumTags: [],
      status: 'ACTIVE',
      isDiagnostic: false,
    },
    {
      challengeId: 'unrelated',
      topic: 'string-parsing',
      subtopics: [],
      learningObjectives: ['basic parsing'],
      primarySkillId: 'parsing',
      supportingSkillIds: [],
      difficulty: baseDims({ algorithm: 20 }),
      prerequisites: [],
      targetRoles: [],
      estimatedTimeMinutes: 10,
      supportedLanguages: ['python'],
      challengeFamily: 'parsing',
      familyTier: 'BASIC',
      transferGroup: 'parsing',
      curriculumTags: [],
      status: 'ACTIVE',
      isDiagnostic: false,
    },
    {
      challengeId: 'advanced-algo',
      topic: 'graph-algorithms',
      subtopics: [],
      learningObjectives: ['advanced graph reasoning'],
      primarySkillId: 'algorithms',
      supportingSkillIds: ['debugging'],
      difficulty: baseDims({ algorithm: 85, state: 60, debugging: 55 }),
      prerequisites: ['algorithms'],
      targetRoles: ['BACKEND'],
      estimatedTimeMinutes: 40,
      supportedLanguages: ['python'],
      challengeFamily: 'graph',
      familyTier: 'ADVANCED',
      transferGroup: 'graph',
      curriculumTags: [],
      status: 'ACTIVE',
      isDiagnostic: false,
    },
    {
      challengeId: 'transfer-challenge',
      topic: 'sliding-window',
      subtopics: [],
      learningObjectives: ['apply the state pattern in a new context'],
      primarySkillId: 'transfer',
      supportingSkillIds: ['state_reasoning'],
      difficulty: baseDims({ algorithm: 45, state: 55, transfer: 75 }),
      prerequisites: [],
      targetRoles: ['BACKEND'],
      estimatedTimeMinutes: 30,
      supportedLanguages: ['python'],
      challengeFamily: 'sliding-window-stream',
      familyTier: 'TRANSFER',
      transferGroup: 'sliding-window',
      curriculumTags: [],
      status: 'ACTIVE',
      isDiagnostic: false,
    },
  ];
}

function evidencePoint(
  skillId: string,
  outcome: 'SUCCESS' | 'FAILURE',
  daysAgo: number,
  extra: Partial<SkillEvidencePoint> = {}
): SkillEvidencePoint {
  return {
    skillId,
    timestamp: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    outcome,
    challengeId: `hist-${skillId}-${daysAgo}-${Math.random().toString(36).slice(2, 6)}`,
    correctness: outcome === 'SUCCESS' ? 0.9 : 0.2,
    dimensionsExercised: {},
    ...extra,
  };
}

function buildInitialStudent(): StudentModel {
  const algoEvidence = [1, 2, 3, 4, 5].map((d) =>
    evidencePoint('algorithms', 'SUCCESS', d * 6, {
      challengeFamily: `algo-fam-${d}`,
      transferGroup: `algo-fam-${d}`,
      understandingScore: 85,
      reasoningScore: 88,
    })
  );
  const stateEvidence = [
    evidencePoint('state_reasoning', 'FAILURE', 10, { understandingScore: 35 }),
    evidencePoint('state_reasoning', 'FAILURE', 4, { understandingScore: 30 }),
  ];
  const debugEvidence = [
    evidencePoint('debugging', 'SUCCESS', 12, { challengeFamily: 'debug-a', transferGroup: 'debug-a' }),
    evidencePoint('debugging', 'SUCCESS', 6, { challengeFamily: 'debug-b', transferGroup: 'debug-b', correctness: 0.6 }),
  ];

  const evidenceBySkill = {
    algorithms: algoEvidence,
    state_reasoning: stateEvidence,
    debugging: debugEvidence,
    transfer: [] as SkillEvidencePoint[],
  };

  return {
    studentId: 'student-a',
    targetRole: 'BACKEND',
    evidenceBySkill,
    completedChallenges: [],
    studentModelVersion: 'golden-v1',
    skills: {
      algorithms: computeSkillState('algorithms', algoEvidence),
      state_reasoning: computeSkillState('state_reasoning', stateEvidence),
      debugging: computeSkillState('debugging', debugEvidence),
      transfer: computeSkillState('transfer', []),
    },
  };
}

test('GOLDEN SCENARIO round 1: selects the state-focused variation, not the unrelated or advanced problem', async () => {
  const student = buildInitialStudent();
  const ports = {
    challengeCatalog: new InMemoryChallengeCatalog(buildPool()),
    studentSkillModel: new InMemoryStudentSkillModel({ [student.studentId]: student }),
    curriculum: new InMemoryCurriculum(),
    auditLog: new InMemoryAuditLog(),
  };

  const { nextBestChallenge } = await selectNextChallenge(student.studentId, { mode: 'PRACTICE' }, ports);

  assertTrue(!!nextBestChallenge, 'a challenge should be selected');
  assertEqual(
    nextBestChallenge!.challengeId,
    'state-variation',
    `expected the state-focused variation, got ${nextBestChallenge!.challengeId}`
  );
  assertTrue(nextBestChallenge!.challengeId !== 'unrelated', 'must not select the irrelevant candidate');
  assertTrue(
    nextBestChallenge!.challengeId !== 'advanced-algo',
    'must not jump straight to the advanced problem while state reasoning is weak'
  );
});

test('GOLDEN SCENARIO round 2: after success, moves toward the transfer challenge as state reasoning firms up', async () => {
  const student = buildInitialStudent();
  student.evidenceBySkill.state_reasoning.push(
    evidencePoint('state_reasoning', 'SUCCESS', 0, {
      understandingScore: 75,
      reasoningScore: 72,
      challengeFamily: 'sliding-window',
      transferGroup: 'sliding-window',
    })
  );
  student.skills.state_reasoning = computeSkillState('state_reasoning', student.evidenceBySkill.state_reasoning);
  student.completedChallenges.push({
    challengeId: 'state-variation',
    challengeFamily: 'sliding-window',
    transferGroup: 'sliding-window',
    completedAt: new Date().toISOString(),
    outcome: 'SUCCESS',
    reasonCompleted: 'STANDARD',
  });

  const ports = {
    challengeCatalog: new InMemoryChallengeCatalog(buildPool()),
    studentSkillModel: new InMemoryStudentSkillModel({ [student.studentId]: student }),
    curriculum: new InMemoryCurriculum(),
    auditLog: new InMemoryAuditLog(),
  };

  const { nextBestChallenge } = await selectNextChallenge(student.studentId, { mode: 'PRACTICE' }, ports);

  assertTrue(!!nextBestChallenge, 'a challenge should be selected');
  assertEqual(
    nextBestChallenge!.challengeId,
    'transfer-challenge',
    `expected the transfer challenge once state reasoning improved, got ${nextBestChallenge!.challengeId}`
  );
});

test('two students with different skill profiles receive different next challenges from the same pool', async () => {
  function mkStudent(id: string, opts: { algoScore: number; debugScore: number }): StudentModel {
    const algoEv = [1, 2, 3, 4].map((d) =>
      evidencePoint('algorithms', 'SUCCESS', d * 6, {
        challengeFamily: `algo-${d}`,
        transferGroup: `algo-${d}`,
        correctness: opts.algoScore / 100,
        understandingScore: opts.algoScore,
        reasoningScore: opts.algoScore,
      })
    );
    const debugEv = [1, 2, 3, 4].map((d) =>
      evidencePoint('debugging', opts.debugScore > 60 ? 'SUCCESS' : 'FAILURE', d * 6, {
        challengeFamily: `debug-${d}`,
        transferGroup: `debug-${d}`,
        correctness: opts.debugScore / 100,
        understandingScore: opts.debugScore,
      })
    );
    return {
      studentId: id,
      targetRole: 'BACKEND',
      evidenceBySkill: { algorithms: algoEv, debugging: debugEv },
      completedChallenges: [],
      studentModelVersion: 'v1',
      skills: {
        algorithms: computeSkillState('algorithms', algoEv),
        debugging: computeSkillState('debugging', debugEv),
      },
    };
  }

  const studentA = mkStudent('student-a2', { algoScore: 90, debugScore: 25 }); // strong algo, weak debugging
  const studentB = mkStudent('student-b2', { algoScore: 60, debugScore: 88 }); // moderate algo, strong debugging

  const pool: ChallengeMetadata[] = [
    {
      challengeId: 'debug-focus',
      topic: 'debugging',
      subtopics: [],
      learningObjectives: ['find the bug in a working algorithm'],
      primarySkillId: 'debugging',
      supportingSkillIds: ['algorithms'],
      difficulty: baseDims({ debugging: 65, algorithm: 45 }),
      prerequisites: [],
      targetRoles: ['BACKEND'],
      estimatedTimeMinutes: 20,
      supportedLanguages: ['python'],
      challengeFamily: 'debug-drills',
      familyTier: 'INTERMEDIATE',
      transferGroup: 'debug-drills',
      curriculumTags: [],
      status: 'ACTIVE',
      isDiagnostic: false,
    },
    {
      challengeId: 'algo-transfer',
      topic: 'algorithms',
      subtopics: [],
      learningObjectives: ['apply a known algorithm in a new context'],
      primarySkillId: 'algorithms',
      supportingSkillIds: [],
      difficulty: baseDims({ algorithm: 55, transfer: 70 }),
      prerequisites: [],
      targetRoles: ['BACKEND'],
      estimatedTimeMinutes: 25,
      supportedLanguages: ['python'],
      challengeFamily: 'algo-transfer-fam',
      familyTier: 'TRANSFER',
      transferGroup: 'algo-transfer-fam',
      curriculumTags: [],
      status: 'ACTIVE',
      isDiagnostic: false,
    },
  ];

  const catalog = new InMemoryChallengeCatalog(pool);
  const skillModel = new InMemoryStudentSkillModel({ [studentA.studentId]: studentA, [studentB.studentId]: studentB });

  const resultA = await selectNextChallenge(studentA.studentId, { mode: 'PRACTICE' }, {
    challengeCatalog: catalog,
    studentSkillModel: skillModel,
    curriculum: new InMemoryCurriculum(),
    auditLog: new InMemoryAuditLog(),
  });
  const resultB = await selectNextChallenge(studentB.studentId, { mode: 'PRACTICE' }, {
    challengeCatalog: catalog,
    studentSkillModel: skillModel,
    curriculum: new InMemoryCurriculum(),
    auditLog: new InMemoryAuditLog(),
  });

  assertEqual(
    resultA.nextBestChallenge!.challengeId,
    'debug-focus',
    `strong-algo/weak-debugging student should get the debugging-focused challenge, got ${resultA.nextBestChallenge?.challengeId}`
  );
  assertEqual(
    resultB.nextBestChallenge!.challengeId,
    'algo-transfer',
    `moderate-algo/strong-debugging student should get the algorithm-transfer challenge, got ${resultB.nextBestChallenge?.challengeId}`
  );
});
