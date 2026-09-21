import { buildTestEngine } from '../helpers/buildEngine';

describe('Full session smoke test', () => {
  it('runs start -> loop -> complete -> result without error and produces a usable payload', async () => {
    const { engine } = buildTestEngine({ seed: 5 });
    const student = { studentId: 'stu-smoke' };
    const state = await engine.startSession({
      student,
      config: {
        requiredDomains: ['Quant', 'Verbal'],
        objective: 'placement_preparation',
        minQuestionsPerDomain: 2,
        minQuestions: 8,
        maxQuestions: 16,
      },
    });

    let guard = 0;
    while (guard < 30) {
      const next = await engine.getNextQuestion(state.sessionId, student.studentId);
      if (next.done) break;
      const isCorrect = guard % 3 !== 0; // deterministic, mixed pattern - not all correct, not all wrong
      await engine.submitResponse(state.sessionId, student.studentId, {
        questionId: next.question!.id,
        isCorrect,
        responseTimeMs: 15000 + (guard % 5) * 3000,
      });
      guard += 1;
    }

    expect(guard).toBeLessThan(30); // sanity: the loop actually terminated via `done`, not the guard

    const result = await engine.completeSession(state.sessionId, student.studentId);
    expect(result.isFinal).toBe(true);
    expect(result.currentCapability.length).toBeGreaterThan(0);
    expect(result.nextBestActions.length).toBeGreaterThan(0);
    expect(result.learningHandoff.length).toBeGreaterThan(0);
    expect(Object.keys(result.difficultyBoundary).length).toBeGreaterThan(0);

    // getResult should also work independently of completeSession having run.
    const resultAgain = await engine.getResult(state.sessionId, student.studentId);
    expect(resultAgain.sessionId).toBe(state.sessionId);
  });
});
