import { buildTestEngine } from '../helpers/buildEngine';

describe('Determinism (spec section 90)', () => {
  it('produces the same sequence of selected questions for identical state, config, and seed', async () => {
    const scriptedCorrectness = [true, false, true, true, false, true, true, true];

    async function run(): Promise<string[]> {
      const { engine } = buildTestEngine({ seed: 123 });
      const student = { studentId: 'student-x' };
      const state = await engine.startSession({
        student,
        config: { requiredDomains: ['Quant', 'Verbal'], minQuestionsPerDomain: 1, minQuestions: 6, maxQuestions: 8 },
      });

      const selected: string[] = [];
      for (const isCorrect of scriptedCorrectness) {
        const next = await engine.getNextQuestion(state.sessionId, student.studentId);
        if (next.done || !next.question) break;
        selected.push(next.question.id);
        await engine.submitResponse(state.sessionId, student.studentId, { questionId: next.question.id, isCorrect, responseTimeMs: 20000 });
      }
      return selected;
    }

    const runA = await run();
    const runB = await run();
    expect(runA).toEqual(runB);
    expect(runA.length).toBeGreaterThan(0);
  });
});
