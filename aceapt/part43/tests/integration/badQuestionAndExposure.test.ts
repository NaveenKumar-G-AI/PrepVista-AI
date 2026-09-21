import { buildTestEngine } from '../helpers/buildEngine';

describe('Bad question protection and exposure (spec sections 91, 92)', () => {
  it('excludes a flagged question from candidates entirely, not merely deprioritizes it', async () => {
    const { engine, questionRepo } = buildTestEngine({ seed: 11 });
    const student = { studentId: 'stu-flag' };

    const grammarQuestions = await questionRepo.findCandidates({ skillIds: ['verbal.grammar.core'] });
    const [keep, ...toFlag] = grammarQuestions;
    for (const question of toFlag) questionRepo.setFlagged(question.id, true);

    const state = await engine.startSession({
      student,
      config: { requiredDomains: ['Verbal'], minQuestionsPerDomain: 0, minQuestions: 1, maxQuestions: 1 },
    });
    const next = await engine.getNextQuestion(state.sessionId, student.studentId);
    expect(next.question?.id).toBe(keep.id);
  });

  it('does not immediately re-serve a just-asked question while alternatives remain', async () => {
    const { engine } = buildTestEngine({ seed: 12 });
    const student = { studentId: 'stu-exposure' };
    const state = await engine.startSession({
      student,
      config: { requiredDomains: ['Verbal'], minQuestionsPerDomain: 0, minQuestions: 1, maxQuestions: 2 },
    });

    const q1 = await engine.getNextQuestion(state.sessionId, student.studentId);
    await engine.submitResponse(state.sessionId, student.studentId, { questionId: q1.question!.id, isCorrect: true, responseTimeMs: 15000 });
    const q2 = await engine.getNextQuestion(state.sessionId, student.studentId);

    expect(q2.question?.id).not.toBe(q1.question?.id);
  });
});
