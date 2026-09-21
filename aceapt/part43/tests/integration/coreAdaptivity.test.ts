import { AdaptiveDiagnosticEngine } from '../../src/engine/AdaptiveDiagnosticEngine';
import {
  InMemoryAnalyticsEventPublisher,
  InMemoryDiagnosticSessionRepository,
  InMemoryQuestionRepository,
  InMemorySkillRepository,
  InMemoryStudentRepository,
} from '../../src/infra/repositories/InMemoryRepositories';
import { FixedClock, SeededRandom } from '../../src/infra/determinism';
import { Question, Skill } from '../../src/domain/types';

// A deliberately isolated single-skill fixture: this removes any cross-skill
// "explore the next unknown skill" effect so the test cleanly demonstrates
// spec section 89's actual requirement - that the SAME skill's next question
// changes in response to a different answer to the previous one.
const SKILL: Skill = { id: 'single.skill', domain: 'Quant', topic: 'Test', label: 'Single Test Skill' };

function makeQuestions(): Question[] {
  return [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2].map((rating, i) => ({
    id: `sq-${i}`,
    skillId: SKILL.id,
    format: 'mcq',
    difficultyRating: rating,
    difficultyBand: 'medium',
    isTransferVariant: false,
    isValidated: true,
    qualityScore: 0.9,
    isFlagged: false,
    tags: [],
  }));
}

function buildIsolatedEngine(seed: number) {
  return new AdaptiveDiagnosticEngine(
    new InMemoryStudentRepository(),
    new InMemoryQuestionRepository(makeQuestions()),
    new InMemorySkillRepository([SKILL]),
    new InMemoryDiagnosticSessionRepository(),
    new InMemoryAnalyticsEventPublisher(),
    new FixedClock(new Date('2026-01-01T00:00:00.000Z')),
    new SeededRandom(seed)
  );
}

describe('Core adaptivity (spec section 89)', () => {
  it('selects a different next question - and a harder one - after a correct vs. an incorrect response', async () => {
    const config = { requiredDomains: ['Quant'] as string[], minQuestionsPerDomain: 0, minQuestions: 1, maxQuestions: 8 };

    const engineA = buildIsolatedEngine(99);
    const engineB = buildIsolatedEngine(99);
    const studentA = { studentId: 'student-a' };
    const studentB = { studentId: 'student-b' };
    const stateA = await engineA.startSession({ student: studentA, config: { ...config } });
    const stateB = await engineB.startSession({ student: studentB, config: { ...config } });

    const q1A = await engineA.getNextQuestion(stateA.sessionId, studentA.studentId);
    const q1B = await engineB.getNextQuestion(stateB.sessionId, studentB.studentId);
    expect(q1A.question?.id).toBe(q1B.question?.id); // identical starting conditions -> identical first pick

    await engineA.submitResponse(stateA.sessionId, studentA.studentId, { questionId: q1A.question!.id, isCorrect: true, responseTimeMs: 15000 });
    await engineB.submitResponse(stateB.sessionId, studentB.studentId, { questionId: q1B.question!.id, isCorrect: false, responseTimeMs: 15000 });

    const q2A = await engineA.getNextQuestion(stateA.sessionId, studentA.studentId);
    const q2B = await engineB.getNextQuestion(stateB.sessionId, studentB.studentId);

    expect(q2A.question?.id).not.toBe(q2B.question?.id);
    expect(q2A.question!.difficultyRating).toBeGreaterThan(q2B.question!.difficultyRating);
  });
});
