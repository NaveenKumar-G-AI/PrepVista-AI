import { buildTestEngine } from '../helpers/buildEngine';

describe('Coverage guardrail (integration, spec sections 22, 95)', () => {
  it('ensures both required domains receive their minimum coverage even under a tight question budget', async () => {
    const { engine } = buildTestEngine({ seed: 3 });
    const student = { studentId: 'stu-cov' };
    const state = await engine.startSession({
      student,
      config: { requiredDomains: ['Quant', 'Verbal'], minQuestionsPerDomain: 2, minQuestions: 4, maxQuestions: 4 },
    });

    const domainsAsked: string[] = [];
    for (let i = 0; i < 4; i++) {
      const next = await engine.getNextQuestion(state.sessionId, student.studentId);
      if (next.done || !next.question) break;
      const domain = next.question.skillId.startsWith('verbal') ? 'Verbal' : 'Quant';
      domainsAsked.push(domain);
      await engine.submitResponse(state.sessionId, student.studentId, { questionId: next.question.id, isCorrect: true, responseTimeMs: 15000 });
    }

    expect(domainsAsked).toHaveLength(4);
    expect(domainsAsked.filter((d) => d === 'Verbal').length).toBeGreaterThanOrEqual(2);
    expect(domainsAsked.filter((d) => d === 'Quant').length).toBeGreaterThanOrEqual(2);
  });
});
